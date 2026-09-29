import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { handleWebhook } from './webhook';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

function mockAppmax(status: { status: string; paymentMethod?: string; email?: string; subTotal?: number }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/orders/') || url.includes('/subscriptions/')) {
			return new Response(
				JSON.stringify({
					data: {
						status: status.status,
						payment_method: status.paymentMethod,
						email: status.email,
						amounts: status.subTotal === undefined ? undefined : { sub_total: status.subTotal, installment_fee: 999 },
					},
				}),
				{ status: 200 }
			);
		}
		// First activation now also sends the magic-link email (customer-area
		// ticket 07) — same Resend seam `identity/magic-link.test.ts` mocks.
		if (url.includes('api.resend.com')) {
			return new Response(null, { status: 200 });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function customerFor(subscriptionRowId: string): Promise<{ id: string; email: string } | null> {
	return env.DB.prepare('SELECT id, email FROM customers WHERE purchase_id = ?')
		.bind(subscriptionRowId)
		.first<{ id: string; email: string }>();
}

async function seed(row: {
	id: string;
	appmax_order_id?: string;
	appmax_subscription_id?: string;
	status: string;
	amount_cents?: number;
}) {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, 'monthly', ?, ?, ?, ?)"
	)
		.bind(
			row.id,
			'starter',
			row.amount_cents ?? 0,
			row.status,
			row.appmax_order_id ?? null,
			row.appmax_subscription_id ?? null
		)
		.run();
}

async function loginTokenCountFor(customerId: string): Promise<number> {
	const { results } = await env.DB.prepare('SELECT * FROM login_tokens WHERE customer_id = ?')
		.bind(customerId)
		.all();
	return results.length;
}

async function statusOf(id: string): Promise<string> {
	const row = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?').bind(id).first<{
		status: string;
	}>();
	if (row === null) throw new Error('row not found');
	return row.status;
}

describe('handleWebhook', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('confirms a pending subscription to active by re-fetching Appmax, never trusting the payload status', async () => {
		await seed({ id: 'sub-happy', appmax_order_id: 'ord_happy', status: 'pending' });
		mockAppmax({ status: 'aprovado', paymentMethod: 'cartao' });

		const result = await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_happy' }));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-happy')).toBe('active');
	});

	it('logs every delivery raw, independent of the idempotency check', async () => {
		await seed({ id: 'sub-log', appmax_order_id: 'ord_log', status: 'pending' });
		mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_log' });

		await handleWebhook(env, payload);
		await handleWebhook(env, payload); // duplicate

		const { results } = await env.DB.prepare(
			'SELECT * FROM webhook_deliveries WHERE idempotency_key = ?'
		)
			.bind('order.paid:ord_log')
			.all();
		expect(results).toHaveLength(2);
	});

	it('replays the same event idempotently: second delivery is a no-op and makes no Appmax status call', async () => {
		await seed({ id: 'sub-dup', appmax_order_id: 'ord_dup', status: 'pending' });
		const fetchSpy = mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_dup' });

		await handleWebhook(env, payload);
		const callsAfterFirst = fetchSpy.mock.calls.length;
		const result = await handleWebhook(env, payload);

		expect(result).toEqual({ status: 200 });
		expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst); // no new auth/status calls
		expect(await statusOf('sub-dup')).toBe('active');
	});

	it('never lets a less-current event undo a more-current one (out-of-order delivery)', async () => {
		await seed({ id: 'sub-stale', appmax_order_id: 'ord_stale', status: 'canceled' });
		mockAppmax({ status: 'aprovado' }); // a stale "it's active" re-fetch, delayed

		const result = await handleWebhook(
			env,
			JSON.stringify({ event: 'order.paid.delayed', order_id: 'ord_stale' })
		);

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-stale')).toBe('canceled');
		// Row exists, just rigidity-blocked — expected out-of-order delivery,
		// not a "no matching row" condition (sentry-integration ticket 02).
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});

	it('ignores a webhook for an order/subscription with no matching row — no error, no new row', async () => {
		mockAppmax({ status: 'aprovado' });

		const result = await handleWebhook(
			env,
			JSON.stringify({ event: 'order.paid', order_id: 'ord_unknown_ref' })
		);

		expect(result).toEqual({ status: 200 });
		const row = await env.DB.prepare('SELECT * FROM purchases WHERE appmax_order_id = ?')
			.bind('ord_unknown_ref')
			.first();
		expect(row).toBeNull();
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			expect.stringContaining('no subscription row matches'),
			expect.objectContaining({ extra: expect.objectContaining({ order_id: 'ord_unknown_ref' }) })
		);
	});

	it('never applies against a Stripe-provider row even if ids happened to collide (docs/adr/0005-stripe-test-driver.md)', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, 'monthly', 0, ?, 'stripe', ?)"
		)
			.bind('sub-stripe-collision', 'starter', 'pending', 'ord_stripe_collision')
			.run();
		mockAppmax({ status: 'aprovado' });

		const result = await handleWebhook(
			env,
			JSON.stringify({ event: 'order.paid', order_id: 'ord_stripe_collision' })
		);

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-stripe-collision')).toBe('pending');
	});

	it('responds 200 and does not throw for an unparseable body', async () => {
		const result = await handleWebhook(env, 'not json');
		expect(result).toEqual({ status: 200 });
	});

	it('provisions a customers row from the authoritative re-fetch when a subscription first becomes active', async () => {
		await seed({ id: 'sub-provision', appmax_order_id: 'ord_provision', status: 'pending' });
		mockAppmax({ status: 'aprovado', email: 'cliente@example.com' });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_provision' }));

		const customer = await customerFor('sub-provision');
		expect(customer?.email).toBe('cliente@example.com');
	});

	it('first activation also auto-sends the magic-link login email — no email typed anywhere on our own checkout', async () => {
		await seed({ id: 'sub-auto-link', appmax_order_id: 'ord_auto_link', status: 'pending' });
		const fetchSpy = mockAppmax({ status: 'aprovado', email: 'cliente@example.com' });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_auto_link' }));

		const customer = await customerFor('sub-auto-link');
		expect(customer).not.toBeNull();
		expect(await loginTokenCountFor(customer!.id)).toBe(1);
		expect(fetchSpy.mock.calls.some((call) => call[0]?.toString().includes('api.resend.com'))).toBe(true);
	});

	it('does not duplicate the customers row, nor re-send a login email, when an already-active event is reapplied', async () => {
		await seed({ id: 'sub-reapply', appmax_order_id: 'ord_reapply', status: 'active' });
		mockAppmax({ status: 'aprovado', email: 'cliente@example.com' });

		// Two distinct events (e.g. a renewal) can each independently
		// re-apply `active` — checkout-webhooks ticket 07's "reapplied event"
		// case — each with its own idempotency key, so both reach the hook.
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_reapply' }));
		await handleWebhook(env, JSON.stringify({ event: 'subscription.renewed', order_id: 'ord_reapply' }));

		const { results } = await env.DB.prepare('SELECT * FROM customers WHERE purchase_id = ?')
			.bind('sub-reapply')
			.all();
		expect(results).toHaveLength(1);

		// The renewal event must not re-issue a login email — only the
		// subscription's first activation does (customer-area ticket 07).
		const customer = await customerFor('sub-reapply');
		expect(await loginTokenCountFor(customer!.id)).toBe(1);
	});

	it('logs visibly and leaves customers unpopulated when Appmax reports no email field', async () => {
		await seed({ id: 'sub-no-email', appmax_order_id: 'ord_no_email', status: 'pending' });
		mockAppmax({ status: 'aprovado' });
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_no_email' }));

		expect(await customerFor('sub-no-email')).toBeNull();
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ord_no_email'));
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			expect.stringContaining('no email field'),
			expect.objectContaining({ extra: expect.objectContaining({ order_id: 'ord_no_email' }) })
		);
	});
	describe('amount check (ADR-0006, PLANNING.md §6 Price integrity)', () => {
		it('activates when the reported sub_total equals the stored amount — installment_fee does not count', async () => {
			await seed({ id: 'amt-ok', appmax_order_id: 'ord_amt_ok', status: 'pending', amount_cents: 49_900 });
			mockAppmax({ status: 'aprovado', email: 'a@example.com', subTotal: 49_900 });

			await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_amt_ok' }));

			expect(await statusOf('amt-ok')).toBe('active');
			expect(Sentry.captureMessage).not.toHaveBeenCalled();
		});

		it('lands rejected on a mismatch, reports to Sentry with purchase id, expected and reported, and provisions nothing', async () => {
			await seed({ id: 'amt-bad', appmax_order_id: 'ord_amt_bad', status: 'pending', amount_cents: 49_900 });
			mockAppmax({ status: 'aprovado', email: 'bad@example.com', subTotal: 100 });

			await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_amt_bad' }));

			expect(await statusOf('amt-bad')).toBe('rejected');
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				expect.stringContaining('amount mismatch'),
				expect.objectContaining({
					extra: expect.objectContaining({ purchase_id: 'amt-bad', expected_cents: 49_900, reported_cents: 100 }),
				})
			);
			expect(await customerFor('amt-bad')).toBeNull();
		});

		it('compares against the stored amount, not the live catalog: a repriced catalog does not flag a legit payment', async () => {
			// 12_345 is no catalog price; the row's own amount is the only truth.
			await seed({ id: 'amt-stored', appmax_order_id: 'ord_amt_stored', status: 'pending', amount_cents: 12_345 });
			mockAppmax({ status: 'aprovado', email: 's@example.com', subTotal: 12_345 });

			await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_amt_stored' }));

			expect(await statusOf('amt-stored')).toBe('active');
		});

		it('a late event still pending cannot flip rejected back to pending, but a matching-amount active can reach active', async () => {
			await seed({ id: 'amt-rank', appmax_order_id: 'ord_amt_rank', status: 'rejected', amount_cents: 500 });
			mockAppmax({ status: 'pendente' });
			await handleWebhook(env, JSON.stringify({ event: 'order.pending', order_id: 'ord_amt_rank' }));
			expect(await statusOf('amt-rank')).toBe('rejected');

			vi.restoreAllMocks();
			mockAppmax({ status: 'aprovado', email: 'r@example.com', subTotal: 500 });
			await handleWebhook(env, JSON.stringify({ event: 'order.paid.again', order_id: 'ord_amt_rank' }));
			expect(await statusOf('amt-rank')).toBe('active');
		});

		it('activates but reports to Sentry when the response carries no amount (field name unverified)', async () => {
			await seed({ id: 'amt-null', appmax_order_id: 'ord_amt_null', status: 'pending', amount_cents: 500 });
			mockAppmax({ status: 'aprovado', email: 'n@example.com' });

			await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_amt_null' }));

			expect(await statusOf('amt-null')).toBe('active');
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				expect.stringContaining('no reported amount'),
				expect.objectContaining({ extra: expect.objectContaining({ purchase_id: 'amt-null' }) })
			);
		});
	});

	describe('Appmax status mapping and envelope', () => {
		it.each([
			['estornado', 'refunded'],
			['recusado_por_risco', 'refunded'],
			['chargeback_em_tratativa', 'chargeback'],
			['chargeback_perdido', 'chargeback'],
		])('maps %s to %s', async (appmaxStatus, expected) => {
			const id = `map-${appmaxStatus}`;
			await seed({ id, appmax_order_id: `ord_${id}`, status: 'active' });
			mockAppmax({ status: appmaxStatus });

			await handleWebhook(env, JSON.stringify({ event: 'order.x', order_id: `ord_${id}` }));

			expect(await statusOf(id)).toBe(expected);
			vi.restoreAllMocks();
		});

		it('cancelado leaves a pending order pending and an active one active', async () => {
			await seed({ id: 'map-cancelado', appmax_order_id: 'ord_map_cancelado', status: 'pending' });
			await seed({ id: 'map-cancelado-active', appmax_order_id: 'ord_map_cancelado_active', status: 'active' });
			mockAppmax({ status: 'cancelado' });

			await handleWebhook(env, JSON.stringify({ event: 'order.x', order_id: 'ord_map_cancelado' }));
			await handleWebhook(env, JSON.stringify({ event: 'order.x', order_id: 'ord_map_cancelado_active' }));

			expect(await statusOf('map-cancelado')).toBe('pending');
			expect(await statusOf('map-cancelado-active')).toBe('active');
		});

		it('pendente_integracao_em_analise changes nothing and reports for the operator', async () => {
			await seed({ id: 'map-analise', appmax_order_id: 'ord_map_analise', status: 'active' });
			mockAppmax({ status: 'pendente_integracao_em_analise' });

			await handleWebhook(env, JSON.stringify({ event: 'order.x', order_id: 'ord_map_analise' }));

			expect(await statusOf('map-analise')).toBe('active');
			expect(Sentry.captureMessage).toHaveBeenCalled();
		});

		it('reads order_id from the real envelope (data{}), where ids may be numbers', async () => {
			await seed({ id: 'env-data', appmax_order_id: '777', status: 'pending' });
			mockAppmax({ status: 'aprovado', email: 'e@example.com' });

			await handleWebhook(
				env,
				JSON.stringify({ event: 'OrderApproved', event_type: 'order', data: { order_id: 777 } })
			);

			expect(await statusOf('env-data')).toBe('active');
		});

		it('does not swallow a failed refetch: releases the idempotency claim and answers 5xx so Appmax retries', async () => {
			await seed({ id: 'retry-me', appmax_order_id: 'ord_retry_me', status: 'pending' });
			const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_retry_me' });
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

			const first = await handleWebhook(env, payload);
			expect(first.status).toBeGreaterThanOrEqual(500);

			vi.restoreAllMocks();
			mockAppmax({ status: 'aprovado', email: 'retry@example.com' });
			const second = await handleWebhook(env, payload);

			expect(second).toEqual({ status: 200 });
			expect(await statusOf('retry-me')).toBe('active');
		});
	});
});
