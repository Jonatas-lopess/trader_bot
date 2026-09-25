import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { redeemMagicLink, requestMagicLink } from './magic-link';
import { isSessionValid, verifySessionCookie } from './session';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

function mockResend() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 200 }));
}

async function seedCustomer(id: string, email: string): Promise<void> {
	const subscriptionId = `sub-${id}`;
	await env.DB.prepare('INSERT INTO subscriptions (id, plan_id, status) VALUES (?, ?, ?)')
		.bind(subscriptionId, 'starter', 'active')
		.run();
	await env.DB.prepare('INSERT INTO customers (id, subscription_id, email) VALUES (?, ?, ?)')
		.bind(id, subscriptionId, email)
		.run();
}

async function seedToken(token: string, customerId: string, opts: { expired?: boolean; used?: boolean } = {}): Promise<void> {
	const expiresAt = opts.expired
		? new Date(Date.now() - 1000).toISOString()
		: new Date(Date.now() + 15 * 60 * 1000).toISOString();
	const usedAt = opts.used ? new Date().toISOString() : null;
	await env.DB.prepare('INSERT INTO login_tokens (token, customer_id, expires_at, used_at) VALUES (?, ?, ?, ?)')
		.bind(token, customerId, expiresAt, usedAt)
		.run();
}

describe('magic-link', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('a matching email gets a token and an email is sent', async () => {
		await seedCustomer('cust-ml-match', 'match@example.com');
		const fetchSpy = mockResend();

		await requestMagicLink(env, { email: 'match@example.com', ip: '203.0.113.1', origin: 'https://example.com' });

		expect(fetchSpy).toHaveBeenCalled();
		const { results } = await env.DB.prepare('SELECT * FROM login_tokens WHERE customer_id = ?')
			.bind('cust-ml-match')
			.all();
		expect(results).toHaveLength(1);
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});

	it('a non-matching email sends no email — same externally-observable outcome as a match being throttled', async () => {
		const fetchSpy = mockResend();

		await requestMagicLink(env, { email: 'nobody@example.com', ip: '203.0.113.2', origin: 'https://example.com' });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('logs visibly when Resend fails, but still mints the token and keeps the generic response contract', async () => {
		await seedCustomer('cust-ml-send-fail', 'send-fail@example.com');
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 500 }));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await requestMagicLink(env, { email: 'send-fail@example.com', ip: '203.0.113.9', origin: 'https://example.com' });

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cust-ml-send-fail'));
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			expect.stringContaining('Resend send failed'),
			expect.objectContaining({ extra: expect.objectContaining({ customer_id: 'cust-ml-send-fail' }) })
		);
		const { results } = await env.DB.prepare('SELECT * FROM login_tokens WHERE customer_id = ?')
			.bind('cust-ml-send-fail')
			.all();
		expect(results).toHaveLength(1);
	});

	it('redeeming a valid token sets a session and consumes the token', async () => {
		await seedCustomer('cust-ml-redeem', 'redeem@example.com');
		await seedToken('tok-redeem', 'cust-ml-redeem');

		const result = await redeemMagicLink(env, 'tok-redeem');

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok');
		const verified = await verifySessionCookie(result.cookieValue, env.SESSION_SECRET);
		expect(verified).toMatchObject({ ok: true, customerId: 'cust-ml-redeem' });
		if (verified.ok) expect(await isSessionValid(env, verified.sessionId)).toBe(true);
	});

	it('replaying an already-used token fails', async () => {
		await seedCustomer('cust-ml-replay', 'replay@example.com');
		await seedToken('tok-replay', 'cust-ml-replay');

		const first = await redeemMagicLink(env, 'tok-replay');
		expect(first.ok).toBe(true);

		const second = await redeemMagicLink(env, 'tok-replay');
		expect(second).toEqual({ ok: false });
	});

	it('an expired token is rejected', async () => {
		await seedCustomer('cust-ml-expired', 'expired@example.com');
		await seedToken('tok-expired', 'cust-ml-expired', { expired: true });

		const result = await redeemMagicLink(env, 'tok-expired');
		expect(result).toEqual({ ok: false });
	});

	it('an unknown token is rejected', async () => {
		const result = await redeemMagicLink(env, 'tok-does-not-exist');
		expect(result).toEqual({ ok: false });
	});
});
