import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { handleWebhook } from './webhook';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

function mockAppmax(status: { status: string; paymentMethod?: string; email?: string }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/orders/') || url.includes('/subscriptions/')) {
			return new Response(
				JSON.stringify({
					data: { status: status.status, payment_method: status.paymentMethod, email: status.email },
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
	return env.DB.prepare('SELECT id, email FROM customers WHERE subscription_id = ?')
		.bind(subscriptionRowId)
		.first<{ id: string; email: string }>();
}

async function seed(row: { id: string; appmax_order_id?: string; appmax_subscription_id?: string; status: string }) {
	await env.DB.prepare(
		'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, ?, ?)'
	)
		.bind(row.id, 'starter', row.status, row.appmax_order_id ?? null, row.appmax_subscription_id ?? null)
		.run();
}

async function loginTokenCountFor(customerId: string): Promise<number> {
	const { results } = await env.DB.prepare('SELECT * FROM login_tokens WHERE customer_id = ?')
		.bind(customerId)
		.all();
	return results.length;
}

async function statusOf(id: string): Promise<string> {
	const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE id = ?').bind(id).first<{
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
		const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE appmax_order_id = ?')
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
			"INSERT INTO subscriptions (id, plan_id, status, provider, appmax_order_id) VALUES (?, ?, ?, 'stripe', ?)"
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

		const { results } = await env.DB.prepare('SELECT * FROM customers WHERE subscription_id = ?')
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
});
