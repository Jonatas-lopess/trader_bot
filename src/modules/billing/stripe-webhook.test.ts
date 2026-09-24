import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleStripeWebhook } from './stripe-webhook';

const WEBHOOK_SECRET = 'whsec_test_do_not_use_in_production';

function testEnv() {
	return { ...env, STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
}

async function sign(rawBody: string, timestamp = String(Math.floor(Date.now() / 1000))): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(WEBHOOK_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
	const hex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `t=${timestamp},v1=${hex}`;
}

function checkoutSessionEvent(id: string, sessionId: string, subscriptionId: string | null = null) {
	return JSON.stringify({
		id,
		type: 'checkout.session.completed',
		data: { object: { id: sessionId, object: 'checkout.session', subscription: subscriptionId } },
	});
}

function mockStripe(status: { status: string; email?: string }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/checkout/sessions/')) {
			return new Response(
				JSON.stringify({
					status: status.status === 'active' ? 'complete' : 'open',
					payment_status: status.status === 'active' ? 'paid' : 'unpaid',
					subscription: status.status === 'active' ? 'sub_from_session' : null,
					customer_details: status.email ? { email: status.email } : null,
				}),
				{ status: 200 }
			);
		}
		if (url.includes('/subscriptions/')) {
			return new Response(JSON.stringify({ status: status.status }), { status: 200 });
		}
		if (url.includes('api.resend.com')) {
			return new Response(null, { status: 200 });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function seed(row: { id: string; appmax_order_id?: string; appmax_subscription_id?: string; status: string }) {
	await env.DB.prepare(
		"INSERT INTO subscriptions (id, plan_id, status, provider, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, 'stripe', ?, ?)"
	)
		.bind(row.id, 'starter', row.status, row.appmax_order_id ?? null, row.appmax_subscription_id ?? null)
		.run();
}

async function statusOf(id: string): Promise<string> {
	const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE id = ?').bind(id).first<{
		status: string;
	}>();
	if (row === null) throw new Error('row not found');
	return row.status;
}

describe('handleStripeWebhook', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects a delivery with no Stripe-Signature header', async () => {
		const result = await handleStripeWebhook(testEnv(), checkoutSessionEvent('evt_1', 'cs_1'), null);
		expect(result).toEqual({ status: 400 });
	});

	it('rejects a delivery whose signature does not match the payload', async () => {
		const payload = checkoutSessionEvent('evt_2', 'cs_2');
		const badSignature = await sign('a different body entirely');

		const result = await handleStripeWebhook(testEnv(), payload, badSignature);

		expect(result).toEqual({ status: 400 });
	});

	it('confirms a pending subscription to active by re-fetching Stripe, never trusting the payload', async () => {
		await seed({ id: 'sub-happy', appmax_order_id: 'cs_happy', status: 'pending' });
		mockStripe({ status: 'active', email: 'cliente@example.com' });
		const payload = checkoutSessionEvent('evt_happy', 'cs_happy');

		const result = await handleStripeWebhook(testEnv(), payload, await sign(payload));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-happy')).toBe('active');
	});

	it('replays the same event idempotently: second delivery makes no new Stripe status call', async () => {
		await seed({ id: 'sub-dup', appmax_order_id: 'cs_dup', status: 'pending' });
		const fetchSpy = mockStripe({ status: 'active', email: 'cliente@example.com' });
		const payload = checkoutSessionEvent('evt_dup', 'cs_dup');
		const signature = await sign(payload);

		await handleStripeWebhook(testEnv(), payload, signature);
		const callsAfterFirst = fetchSpy.mock.calls.length;
		const result = await handleStripeWebhook(testEnv(), payload, signature);

		expect(result).toEqual({ status: 200 });
		expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
		expect(await statusOf('sub-dup')).toBe('active');
	});

	it('never lets a less-current event undo a more-current one', async () => {
		await seed({ id: 'sub-stale', appmax_order_id: 'cs_stale', status: 'canceled' });
		mockStripe({ status: 'active' });
		const payload = checkoutSessionEvent('evt_stale', 'cs_stale');

		const result = await handleStripeWebhook(testEnv(), payload, await sign(payload));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-stale')).toBe('canceled');
	});

	it('never applies against an Appmax row even if ids happened to collide', async () => {
		await env.DB.prepare(
			"INSERT INTO subscriptions (id, plan_id, status, provider, appmax_order_id) VALUES (?, ?, ?, 'appmax', ?)"
		)
			.bind('sub-appmax-collision', 'starter', 'pending', 'cs_collision')
			.run();
		mockStripe({ status: 'active' });
		const payload = checkoutSessionEvent('evt_collision', 'cs_collision');

		const result = await handleStripeWebhook(testEnv(), payload, await sign(payload));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-appmax-collision')).toBe('pending');
	});

	it('provisions a customer and sends the magic-link email on first activation', async () => {
		await seed({ id: 'sub-provision', appmax_order_id: 'cs_provision', status: 'pending' });
		const fetchSpy = mockStripe({ status: 'active', email: 'cliente@example.com' });
		const payload = checkoutSessionEvent('evt_provision', 'cs_provision');

		await handleStripeWebhook(testEnv(), payload, await sign(payload));

		const customer = await env.DB.prepare('SELECT id, email FROM customers WHERE subscription_id = ?')
			.bind('sub-provision')
			.first<{ id: string; email: string }>();
		expect(customer?.email).toBe('cliente@example.com');
		expect(fetchSpy.mock.calls.some((call) => call[0]?.toString().includes('api.resend.com'))).toBe(true);
	});

	it('responds 200 and does not throw for an unparseable body with a valid signature', async () => {
		const payload = 'not json';
		const result = await handleStripeWebhook(testEnv(), payload, await sign(payload));
		expect(result).toEqual({ status: 200 });
	});
});
