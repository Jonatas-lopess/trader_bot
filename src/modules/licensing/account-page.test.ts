import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession } from '../identity/session';
import { resolveAccountView } from './account-page';

async function seedAccount(params: { purchaseId: string; customerId: string; planId: string; offer?: string }) {
	await env.DB.prepare('INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, ?, 0, ?)')
		.bind(params.purchaseId, params.planId, params.offer ?? 'monthly', 'active')
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

	it('resolves the Robô name and "none" license for an authenticated Cliente with no licenses row', async () => {
		await seedAccount({ purchaseId: 'sub-account-1', customerId: 'cust-account-1', planId: 'robo-exemplo-a' });
		const { cookieValue } = await createSession(env, 'cust-account-1');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({
			ok: true,
			canCancel: true,
			robotName: 'Robô Exemplo A',
			license: { status: 'none' },
			subscriptionStatus: 'active',
		});
	});

	it('resolves the "active" license once expires_at is set', async () => {
		await seedAccount({ purchaseId: 'sub-account-2', customerId: 'cust-account-2', planId: 'robo-exemplo-b' });
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, expires_at) VALUES (?, ?, ?, ?)')
			.bind('sub-account-2', 'robo-exemplo-b', 'active', '2027-06-20T00:00:00.000Z')
			.run();
		const { cookieValue } = await createSession(env, 'cust-account-2');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({
			ok: true,
			canCancel: true,
			robotName: 'Robô Exemplo B',
			license: { status: 'active', expiresAt: '2027-06-20T00:00:00.000Z' },
			subscriptionStatus: 'active',
		});
	});

	it.each(['one_time', 'annual'])('does not offer cancel for a %s purchase — no recurring Assinatura', async (offer) => {
		await seedAccount({ purchaseId: `sub-account-${offer}`, customerId: `cust-account-${offer}`, planId: 'robo-exemplo-a', offer });
		const { cookieValue } = await createSession(env, `cust-account-${offer}`);

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({ ok: true, canCancel: false });
	});

	it('does not offer cancel once a Mensal is canceled', async () => {
		await seedAccount({ purchaseId: 'sub-account-canceled', customerId: 'cust-account-canceled', planId: 'robo-exemplo-a' });
		await env.DB.prepare("UPDATE purchases SET status = 'canceled' WHERE id = ?").bind('sub-account-canceled').run();
		const { cookieValue } = await createSession(env, 'cust-account-canceled');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({ ok: true, canCancel: false });
	});

	it('redirects (ok: false) when the session is valid but no customers row matches — no account to show', async () => {
		const { cookieValue } = await createSession(env, 'cust-account-orphan');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({ ok: false });
	});
});
