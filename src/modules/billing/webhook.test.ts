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
		if (url.includes('/orders/')) {
			return new Response(
				JSON.stringify({
					data: {
						order: {
							status: status.status,
							amounts: status.subTotal === undefined ? undefined : { sub_total: status.subTotal, installment_fee: 999 },
						},
						payment: status.paymentMethod === undefined ? undefined : { method: status.paymentMethod },
						// A document keeps ticket 13's missing-document Sentry report out of these tests' assertions.
						customer: { name: 'Test Buyer', email: status.email, document_number: '123.456.789-09' },
					},
				}),
				{ status: 200 }
			);
		}
		// Mensal's subscription resource keeps the old flat shape until ticket 09.
		if (url.includes('/subscriptions/')) {
			return new Response(JSON.stringify({ data: { status: status.status, email: status.email } }), { status: 200 });
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
	return env.DB.prepare('SELECT c.id AS id, c.email AS email FROM customers c JOIN purchases p ON p.customer_id = c.id WHERE p.id = ?')
		.bind(subscriptionRowId)
		.first<{ id: string; email: string }>();
}

async function seed(row: {
	id: string;
	appmax_order_id?: string;
	appmax_subscription_id?: string;
	status: string;
	amount_cents?: number;
	offer?: string;
}) {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
	)
		.bind(
			row.id,
			'starter',
			row.offer ?? 'monthly',
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

		const result = await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_happy' }));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-happy')).toBe('active');
	});

	it('logs every delivery raw, independent of the idempotency check', async () => {
		await seed({ id: 'sub-log', appmax_order_id: 'ord_log', status: 'pending' });
		mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order_approved', order_id: 'ord_log' });

		await handleWebhook(env, payload);
		await handleWebhook(env, payload); // duplicate

		const { results } = await env.DB.prepare(
			'SELECT * FROM webhook_deliveries WHERE idempotency_key = ?'
		)
			.bind('order_approved:ord_log')
			.all();
		expect(results).toHaveLength(2);
	});

	it('replays the same event idempotently: second delivery is a no-op and makes no Appmax status call', async () => {
		await seed({ id: 'sub-dup', appmax_order_id: 'ord_dup', status: 'pending' });
		const fetchSpy = mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order_approved', order_id: 'ord_dup' });

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
			JSON.stringify({ event: 'order_paid', order_id: 'ord_stale' })
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
			JSON.stringify({ event: 'order_approved', order_id: 'ord_unknown_ref' })
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
			JSON.stringify({ event: 'order_approved', order_id: 'ord_stripe_collision' })
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

		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_provision' }));

		const customer = await customerFor('sub-provision');
		expect(customer?.email).toBe('cliente@example.com');
	});

	it('first activation also auto-sends the magic-link login email — no email typed anywhere on our own checkout', async () => {
		await seed({ id: 'sub-auto-link', appmax_order_id: 'ord_auto_link', status: 'pending' });
		const fetchSpy = mockAppmax({ status: 'aprovado', email: 'auto-link@example.com' });

		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_auto_link' }));

		const customer = await customerFor('sub-auto-link');
		expect(customer).not.toBeNull();
		expect(await loginTokenCountFor(customer!.id)).toBe(1);
		expect(fetchSpy.mock.calls.some((call) => call[0]?.toString().includes('api.resend.com'))).toBe(true);
	});

	it('does not duplicate the customers row, nor re-send a login email, when an already-active event is reapplied', async () => {
		await seed({ id: 'sub-reapply', appmax_order_id: 'ord_reapply', status: 'active' });
		mockAppmax({ status: 'aprovado', email: 'reapply@example.com' });

		// Two distinct events (e.g. a renewal) can each independently
		// re-apply `active` — checkout-webhooks ticket 07's "reapplied event"
		// case — each with its own idempotency key, so both reach the hook.
		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_reapply' }));
		await handleWebhook(env, JSON.stringify({ event: 'subscription_renewed', order_id: 'ord_reapply' }));

		const { results } = await env.DB.prepare('SELECT c.* FROM customers c JOIN purchases p ON p.customer_id = c.id WHERE p.id = ?')
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

		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_no_email' }));

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

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_amt_ok' }));

			expect(await statusOf('amt-ok')).toBe('active');
			expect(Sentry.captureMessage).not.toHaveBeenCalled();
		});

		it('lands rejected on a mismatch, reports to Sentry with purchase id, expected and reported, and provisions nothing', async () => {
			await seed({ id: 'amt-bad', appmax_order_id: 'ord_amt_bad', status: 'pending', amount_cents: 49_900 });
			mockAppmax({ status: 'aprovado', email: 'bad@example.com', subTotal: 100 });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_amt_bad' }));

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

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_amt_stored' }));

			expect(await statusOf('amt-stored')).toBe('active');
		});

		it('a late event still pending cannot flip rejected back to pending, but a matching-amount active can reach active', async () => {
			await seed({ id: 'amt-rank', appmax_order_id: 'ord_amt_rank', status: 'rejected', amount_cents: 500 });
			mockAppmax({ status: 'pendente' });
			await handleWebhook(env, JSON.stringify({ event: 'order_pix_created', order_id: 'ord_amt_rank' }));
			expect(await statusOf('amt-rank')).toBe('rejected');

			vi.restoreAllMocks();
			mockAppmax({ status: 'aprovado', email: 'r@example.com', subTotal: 500 });
			await handleWebhook(env, JSON.stringify({ event: 'order_paid_by_pix', order_id: 'ord_amt_rank' }));
			expect(await statusOf('amt-rank')).toBe('active');
		});

		it('activates but reports to Sentry when the response carries no amount (field name unverified)', async () => {
			await seed({ id: 'amt-null', appmax_order_id: 'ord_amt_null', status: 'pending', amount_cents: 500 });
			mockAppmax({ status: 'aprovado', email: 'n@example.com' });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_amt_null' }));

			expect(await statusOf('amt-null')).toBe('active');
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				expect.stringContaining('no reported amount'),
				expect.objectContaining({ extra: expect.objectContaining({ purchase_id: 'amt-null' }) })
			);
		});
	});

	describe('an order holding several purchases (storefront-v2 12, ADR-0008)', () => {
		// A cart of 2 × Compra of one Robô and 1 × Anual of another: three rows, one Appmax order.
		const GROUP = [
			{ suffix: 'a1', robot: 'robo-a', offer: 'one_time', amount: 99_700 },
			{ suffix: 'a2', robot: 'robo-a', offer: 'one_time', amount: 99_700 },
			{ suffix: 'b1', robot: 'robo-b', offer: 'annual', amount: 59_700 },
		];
		const TOTAL = 2 * 99_700 + 59_700;

		async function seedGroup(name: string, status = 'pending'): Promise<string[]> {
			const ids = GROUP.map(({ suffix }) => `${name}-${suffix}`);
			await env.DB.batch(
				GROUP.map(({ robot, offer, amount }, index) =>
					env.DB.prepare(
						"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id, checkout_id) VALUES (?, ?, ?, ?, ?, 'appmax', ?, ?)"
					).bind(ids[index], robot, offer, amount, status, `ord_${name}`, ids[0])
				)
			);
			return ids;
		}

		async function groupState(ids: string[]) {
			const { results } = await env.DB.prepare(
				`SELECT p.id, p.status, p.customer_id, l.expires_at, l.status AS license_status
				 FROM purchases p LEFT JOIN licenses l ON l.purchase_id = p.id
				 WHERE p.id IN (?, ?, ?) ORDER BY p.id`
			)
				.bind(...ids)
				.all<{ id: string; status: string; customer_id: string | null; expires_at: string | null; license_status: string | null }>();
			return results;
		}

		const resendCalls = (spy: ReturnType<typeof mockAppmax>) =>
			spy.mock.calls.filter((call) => call[0]?.toString().includes('api.resend.com')).length;

		it('activates every row when the reported sub_total equals the sum of the rows: one Cliente, one login link, one Licença per row', async () => {
			const ids = await seedGroup('grp-ok');
			const fetchSpy = mockAppmax({ status: 'aprovado', email: 'grupo@example.com', subTotal: TOTAL });

			const result = await handleWebhook(env, JSON.stringify({ event: 'order_approved', data: { order_id: 'ord_grp-ok' } }));

			expect(result).toEqual({ status: 200 });
			const rows = await groupState(ids);
			expect(rows.map((row) => row.status)).toEqual(['active', 'active', 'active']);
			expect(new Set(rows.map((row) => row.customer_id)).size).toBe(1);
			expect(rows[0].customer_id).not.toBeNull();
			expect(rows.map((row) => row.license_status)).toEqual(['awaiting_account', 'awaiting_account', 'awaiting_account']);
			expect(rows.find((row) => row.id === 'grp-ok-b1')?.expires_at).not.toBe('9999-12-31T23:59:59.000Z');
			expect(rows.find((row) => row.id === 'grp-ok-a1')?.expires_at).toBe('9999-12-31T23:59:59.000Z');
			const { results: customers } = await env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind('grupo@example.com').all();
			expect(customers).toHaveLength(1);
			expect(await loginTokenCountFor(rows[0].customer_id!)).toBe(1);
			expect(resendCalls(fetchSpy)).toBe(1);
			expect(Sentry.captureMessage).not.toHaveBeenCalled();
		});

		it('rejects every row on a mismatch with one Sentry report of the order, the expected sum and the reported value', async () => {
			const ids = await seedGroup('grp-bad');
			// The amount of one row is not the order's total.
			mockAppmax({ status: 'aprovado', email: 'grupo-bad@example.com', subTotal: 99_700 });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', data: { order_id: 'ord_grp-bad' } }));

			const rows = await groupState(ids);
			expect(rows.map((row) => row.status)).toEqual(['rejected', 'rejected', 'rejected']);
			expect(rows.every((row) => row.customer_id === null && row.license_status === null)).toBe(true);
			const mismatchReports = vi.mocked(Sentry.captureMessage).mock.calls.filter(([message]) => String(message).includes('amount mismatch'));
			expect(mismatchReports).toHaveLength(1);
			expect(mismatchReports[0][1]).toMatchObject({
				extra: { order_id: 'ord_grp-bad', expected_cents: TOTAL, reported_cents: 99_700, rows: 3 },
			});
		});

		it('a redelivered or reordered event leaves the same final state and sends no second login link', async () => {
			const ids = await seedGroup('grp-redo');
			const fetchSpy = mockAppmax({ status: 'aprovado', email: 'grupo-redo@example.com', subTotal: TOTAL });
			const paid = JSON.stringify({ event: 'order_paid', data: { order_id: 'ord_grp-redo' } });

			await handleWebhook(env, paid);
			await handleWebhook(env, paid);
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', data: { order_id: 'ord_grp-redo' } }));
			vi.restoreAllMocks();
			// A late "Boleto created" whose refetch still says pendente (stale read) cannot pull them back.
			mockAppmax({ status: 'pendente', paymentMethod: 'boleto' });
			await handleWebhook(env, JSON.stringify({ event: 'order_billet_created', data: { order_id: 'ord_grp-redo' } }));

			const rows = await groupState(ids);
			expect(rows.map((row) => row.status)).toEqual(['active', 'active', 'active']);
			expect(rows.map((row) => row.license_status)).toEqual(['awaiting_account', 'awaiting_account', 'awaiting_account']);
			expect(await loginTokenCountFor(rows[0].customer_id!)).toBe(1);
			expect(resendCalls(fetchSpy)).toBe(1);
		});

		it('a Boleto created then paid moves every row from pending to active', async () => {
			const ids = await seedGroup('grp-boleto');
			mockAppmax({ status: 'pendente', paymentMethod: 'boleto' });
			await handleWebhook(env, JSON.stringify({ event: 'order_billet_created', data: { order_id: 'ord_grp-boleto' } }));
			expect((await groupState(ids)).map((row) => row.status)).toEqual(['pending', 'pending', 'pending']);

			vi.restoreAllMocks();
			mockAppmax({ status: 'aprovado', paymentMethod: 'boleto', email: 'grupo-boleto@example.com', subTotal: TOTAL });
			await handleWebhook(env, JSON.stringify({ event: 'order_paid', data: { order_id: 'ord_grp-boleto' } }));

			const rows = await groupState(ids);
			expect(rows.map((row) => row.status)).toEqual(['active', 'active', 'active']);
			expect(rows.every((row) => row.license_status === 'awaiting_account')).toBe(true);
		});

		it('a refund of the order refunds every row and ends every Licença now', async () => {
			const ids = await seedGroup('grp-refund');
			mockAppmax({ status: 'aprovado', email: 'grupo-refund@example.com', subTotal: TOTAL });
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', data: { order_id: 'ord_grp-refund' } }));

			vi.restoreAllMocks();
			mockAppmax({ status: 'estornado', subTotal: TOTAL });
			const before = Date.now();
			await handleWebhook(env, JSON.stringify({ event: 'order_refund', data: { order_id: 'ord_grp-refund' } }));

			const rows = await groupState(ids);
			expect(rows.map((row) => row.status)).toEqual(['refunded', 'refunded', 'refunded']);
			for (const row of rows) {
				expect(new Date(row.expires_at!).getTime()).toBeGreaterThanOrEqual(before - 1000);
				expect(new Date(row.expires_at!).getTime()).toBeLessThanOrEqual(Date.now());
			}
		});
	});

	describe('Licença expiry (license-expiry.ts)', () => {
		async function expiryOf(id: string): Promise<string | null> {
			const row = await env.DB.prepare('SELECT expires_at FROM licenses WHERE purchase_id = ?')
				.bind(id)
				.first<{ expires_at: string | null }>();
			return row === null ? null : row.expires_at;
		}

		it('creates the Licença with the lifetime sentinel when a Compra activates', async () => {
			await seed({ id: 'lic-onetime', appmax_order_id: 'ord_lic_onetime', status: 'pending', offer: 'one_time' });
			mockAppmax({ status: 'aprovado' });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_lic_onetime' }));

			expect(await expiryOf('lic-onetime')).toBe('9999-12-31T23:59:59.000Z');
		});

		it('sets expiry to now on refund, and a later stale active event cannot undo it', async () => {
			await seed({ id: 'lic-refund', appmax_order_id: 'ord_lic_refund', status: 'pending', offer: 'one_time' });
			mockAppmax({ status: 'aprovado' });
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_lic_refund' }));
			vi.restoreAllMocks();

			const before = Date.now();
			mockAppmax({ status: 'estornado' });
			await handleWebhook(env, JSON.stringify({ event: 'order_refund', order_id: 'ord_lic_refund' }));
			const refundedExpiry = await expiryOf('lic-refund');
			expect(new Date(refundedExpiry!).getTime()).toBeGreaterThanOrEqual(before);
			expect(new Date(refundedExpiry!).getTime()).toBeLessThanOrEqual(Date.now());
			vi.restoreAllMocks();

			mockAppmax({ status: 'aprovado' });
			await handleWebhook(env, JSON.stringify({ event: 'order_paid', order_id: 'ord_lic_refund' }));

			expect(await statusOf('lic-refund')).toBe('refunded');
			expect(await expiryOf('lic-refund')).toBe(refundedExpiry);
		});

		it('creates no Licença when the payment is rejected by the amount check', async () => {
			await seed({ id: 'lic-rejected', appmax_order_id: 'ord_lic_rejected', status: 'pending', offer: 'one_time', amount_cents: 1000 });
			mockAppmax({ status: 'aprovado', subTotal: 999 });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_lic_rejected' }));

			expect(await statusOf('lic-rejected')).toBe('rejected');
			expect(await expiryOf('lic-rejected')).toBeNull();
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

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: `ord_${id}` }));

			expect(await statusOf(id)).toBe(expected);
			vi.restoreAllMocks();
		});

		it('cancelado leaves a pending order pending and an active one active', async () => {
			await seed({ id: 'map-cancelado', appmax_order_id: 'ord_map_cancelado', status: 'pending' });
			await seed({ id: 'map-cancelado-active', appmax_order_id: 'ord_map_cancelado_active', status: 'active' });
			mockAppmax({ status: 'cancelado' });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_map_cancelado' }));
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_map_cancelado_active' }));

			expect(await statusOf('map-cancelado')).toBe('pending');
			expect(await statusOf('map-cancelado-active')).toBe('active');
		});

		it('pendente_integracao_em_analise changes nothing and reports for the operator', async () => {
			await seed({ id: 'map-analise', appmax_order_id: 'ord_map_analise', status: 'active' });
			mockAppmax({ status: 'pendente_integracao_em_analise' });

			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_map_analise' }));

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
			const payload = JSON.stringify({ event: 'order_approved', order_id: 'ord_retry_me' });
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

			const first = await handleWebhook(env, payload);
			expect(first.status).toBeGreaterThanOrEqual(500);

			vi.restoreAllMocks();
			mockAppmax({ status: 'aprovado', email: 'retry@example.com' });
			const second = await handleWebhook(env, payload);

			expect(second).toEqual({ status: 200 });
			expect(await statusOf('retry-me')).toBe('active');
			const claim = await env.DB.prepare('SELECT id FROM processed_webhooks WHERE id = ?').bind('order_approved:ord_retry_me').first();
			expect(claim).not.toBeNull();
		});
	});

	describe('documented Appmax events (appmax-checkout 07, PLANNING.md §13)', () => {
		// [event, order status on the refetch, payment method, row before, row after]
		it.each([
			['order_authorized', 'autorizado', 'cartao', 'pending', 'pending'],
			['order_approved', 'aprovado', 'cartao', 'pending', 'active'],
			['order_pix_created', 'pendente', 'pix', 'pending', 'pending'],
			['order_paid_by_pix', 'aprovado', 'pix', 'pending', 'active'],
			['order_billet_created', 'pendente', 'boleto', 'pending', 'pending'],
			['order_paid', 'aprovado', 'boleto', 'pending', 'active'],
			['order_paid', 'integrado', 'boleto', 'pending', 'active'],
			['order_refund', 'estornado', 'cartao', 'active', 'refunded'],
			['order_chargeback_in_treatment', 'chargeback_em_tratativa', 'cartao', 'active', 'chargeback'],
			['order_refused_by_risk', 'recusado_por_risco', 'cartao', 'pending', 'refunded'],
			['order_pix_expired', 'cancelado', 'pix', 'pending', 'pending'],
			['payment_not_authorized', 'cancelado', 'cartao', 'pending', 'pending'],
			['order_billet_overdue', 'pendente', 'boleto', 'pending', 'pending'],
		])('%s with the order %s (%s): %s -> %s, decided by the refetch', async (event, appmaxStatus, method, before, after) => {
			const id = `evt-${event}-${appmaxStatus}`;
			await seed({ id, appmax_order_id: `ord_${id}`, status: before, offer: 'one_time' });
			const fetchSpy = mockAppmax({ status: appmaxStatus, paymentMethod: method, email: `${event}@example.com` });

			const result = await handleWebhook(env, JSON.stringify({ event, event_type: 'order', data: { order_id: `ord_${id}` } }));

			expect(result).toEqual({ status: 200 });
			expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes(`/v1/orders/ord_${id}`))).toBe(true);
			expect(await statusOf(id)).toBe(after);
		});

		it.each(['order_pix_expired', 'payment_not_authorized', 'order_billet_overdue'])(
			'%s never overwrites a higher-ranked status',
			async (event) => {
				const id = `evt-high-${event}`;
				await seed({ id, appmax_order_id: `ord_${id}`, status: 'active', offer: 'one_time' });
				mockAppmax({ status: 'cancelado' });

				await handleWebhook(env, JSON.stringify({ event, data: { order_id: `ord_${id}` } }));

				expect(await statusOf(id)).toBe('active');
			}
		);

		it('reads the CamelCase spelling of an event as the same event', async () => {
			await seed({ id: 'evt-camel', appmax_order_id: 'ord_evt_camel', status: 'pending' });
			mockAppmax({ status: 'aprovado' });

			await handleWebhook(env, JSON.stringify({ event: 'OrderPaidByPix', data: { order_id: 'ord_evt_camel' } }));

			expect(await statusOf('evt-camel')).toBe('active');
			const delivery = await env.DB.prepare('SELECT 1 FROM webhook_deliveries WHERE idempotency_key = ?')
				.bind('order_paid_by_pix:ord_evt_camel')
				.first();
			expect(delivery).not.toBeNull();
		});

		it('a forged payload status and decimal amount change nothing beyond what the refetch says', async () => {
			await seed({ id: 'evt-forged', appmax_order_id: 'ord_evt_forged', status: 'pending', amount_cents: 99_700, offer: 'one_time' });
			mockAppmax({ status: 'pendente', paymentMethod: 'pix' });

			await handleWebhook(
				env,
				JSON.stringify({
					event: 'order_paid_by_pix',
					data: { order_id: 'ord_evt_forged', status: 'aprovado', total: 1.0, sub_total: 1.0 },
				})
			);

			expect(await statusOf('evt-forged')).toBe('pending');
		});

		it('the amount check uses the refetch (cents), not the payload (decimal reais)', async () => {
			await seed({ id: 'evt-amount', appmax_order_id: 'ord_evt_amount', status: 'pending', amount_cents: 99_700, offer: 'one_time' });
			mockAppmax({ status: 'aprovado', email: 'amount@example.com', subTotal: 99_700 });

			// 997.00 reais is the same money as 99_700 cents; 1.00 would be a mismatch if it were read.
			await handleWebhook(
				env,
				JSON.stringify({ event: 'order_approved', data: { order_id: 'ord_evt_amount', total: 1.0, sub_total: 1.0 } })
			);

			expect(await statusOf('evt-amount')).toBe('active');
			expect(Sentry.captureMessage).not.toHaveBeenCalledWith(expect.stringContaining('amount mismatch'), expect.anything());
		});

		it('an unknown event is stored and acknowledged, with no refetch and no state change', async () => {
			await seed({ id: 'evt-unknown', appmax_order_id: 'ord_evt_unknown', status: 'pending' });
			const fetchSpy = mockAppmax({ status: 'aprovado' });
			const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

			const result = await handleWebhook(env, JSON.stringify({ event: 'customer_created', data: { order_id: 'ord_evt_unknown' } }));

			expect(result).toEqual({ status: 200 });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(await statusOf('evt-unknown')).toBe('pending');
			expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('customer_created'));
			const delivery = await env.DB.prepare('SELECT payload FROM webhook_deliveries WHERE idempotency_key = ?')
				.bind('customer_created:ord_evt_unknown')
				.first<{ payload: string }>();
			expect(delivery?.payload).toContain('customer_created');
		});
	});
});
