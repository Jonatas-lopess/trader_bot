import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from './checkout';

// Only the outbound fetch to Appmax is mocked (spec.md's Testing
// Decisions) — the D1 write below runs against the real binding from
// ticket 01.
function mockAppmax(response: { ok: true; orderId: string } | { ok: false }) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/payment-links')) {
			if (!response.ok) return new Response('unavailable', { status: 503 });
			return new Response(
				JSON.stringify({
					data: { url: 'https://checkout.sandboxappmax.com.br/pay/abc', order_id: response.orderId },
				}),
				{ status: 200 }
			);
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

describe('createCheckoutSession', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects an unknown plan without calling Appmax', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await createCheckoutSession(env, { planId: 'yearly-mega', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, status: 400, message: 'Unknown or missing plan.' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects a missing plan without calling Appmax', async () => {
		const result = await createCheckoutSession(env, { planId: null, origin: 'https://example.com' });
		expect(result).toEqual({ ok: false, status: 400, message: 'Unknown or missing plan.' });
	});

	it('writes a pending provisional row and redirects to Appmax on success', async () => {
		mockAppmax({ ok: true, orderId: 'ord_123' });

		const result = await createCheckoutSession(env, { planId: 'starter', origin: 'https://example.com' });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok result');
		expect(result.redirectUrl).toBe('https://checkout.sandboxappmax.com.br/pay/abc');

		const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE appmax_order_id = ?')
			.bind('ord_123')
			.first();
		expect(row).toMatchObject({ plan_id: 'starter', status: 'pending', appmax_order_id: 'ord_123' });
	});

	it('returns 502 and writes no row when Appmax is unavailable', async () => {
		mockAppmax({ ok: false });

		const result = await createCheckoutSession(env, { planId: 'pro', origin: 'https://example.com' });

		expect(result).toEqual({
			ok: false,
			status: 502,
			message: 'Payment provider unavailable, try again shortly.',
		});

		const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE plan_id = ?')
			.bind('pro')
			.first();
		expect(row).toBeNull();
	});
});
