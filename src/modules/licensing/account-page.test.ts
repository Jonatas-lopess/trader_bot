import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession } from '../identity/session';
import { resolveAccountView } from './account-page';

async function seedAccount(params: { purchaseId: string; customerId: string; planId: string }) {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'monthly', 0, ?)")
		.bind(params.purchaseId, params.planId, 'active')
		.run();
	await env.DB.prepare('INSERT INTO customers (id, purchase_id, email) VALUES (?, ?, ?)')
		.bind(params.customerId, params.purchaseId, `${params.customerId}@example.com`)
		.run();
}

function requestWithCookie(cookieValue: string): Request {
	return new Request('https://example.com/conta', { headers: { Cookie: `session=${cookieValue}` } });
}

describe('resolveAccountView', () => {
	it('redirects (ok: false) for an unauthenticated request — User Story 13', async () => {
		const result = await resolveAccountView(env, new Request('https://example.com/conta'));
		expect(result).toEqual({ ok: false });
	});

	it('resolves the Plano name and "preparing" license for an authenticated Cliente with no licenses row', async () => {
		await seedAccount({ purchaseId: 'sub-account-1', customerId: 'cust-account-1', planId: 'pro' });
		const { cookieValue } = await createSession(env, 'cust-account-1');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({
			ok: true,
			planName: 'Pro',
			license: { status: 'preparing', expiresAt: null },
			subscriptionStatus: 'active',
		});
	});

	it('resolves the "active" license once expires_at is set', async () => {
		await seedAccount({ purchaseId: 'sub-account-2', customerId: 'cust-account-2', planId: 'starter' });
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, expires_at) VALUES (?, ?, ?, ?)')
			.bind('sub-account-2', 'starter', 'active', '2027-06-20T00:00:00.000Z')
			.run();
		const { cookieValue } = await createSession(env, 'cust-account-2');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({
			ok: true,
			planName: 'Starter',
			license: { status: 'active', expiresAt: '2027-06-20T00:00:00.000Z' },
			subscriptionStatus: 'active',
		});
	});

	it('redirects (ok: false) when the session is valid but no customers row matches — no account to show', async () => {
		const { cookieValue } = await createSession(env, 'cust-account-orphan');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({ ok: false });
	});
});
