import { env } from 'cloudflare:workers';
import { seedCustomer } from '../../../test/customer-seed';
import { describe, expect, it } from 'vitest';
import { createSession } from '../identity/session';
import { resolveAccountView } from './account-page';

async function seedAccount(params: { purchaseId: string; customerId: string; planId: string; offer?: string; email?: string }) {
	await env.DB.prepare('INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, ?, 0, ?)')
		.bind(params.purchaseId, params.planId, params.offer ?? 'monthly', 'active')
		.run();
	await seedCustomer({ purchaseId: params.purchaseId, customerId: params.customerId, email: params.email ?? `${params.customerId}@example.com` });
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
			robots: [
				{
					robotName: 'Robô Exemplo A',
					licenses: [{ purchaseId: 'sub-account-1', offer: 'monthly', corretoraAccount: null, canCancel: true, license: { status: 'none' }, subscriptionStatus: 'active' }],
				},
			],
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
			robots: [
				{
					robotName: 'Robô Exemplo B',
					licenses: [
						{
							purchaseId: 'sub-account-2',
							offer: 'monthly',
							corretoraAccount: null,
							canCancel: true,
							license: { status: 'active', expiresAt: '2027-06-20T00:00:00.000Z' },
							subscriptionStatus: 'active',
						},
					],
				},
			],
		});
	});

	it.each(['one_time', 'annual'])('does not offer cancel for a %s purchase — no recurring Assinatura', async (offer) => {
		await seedAccount({ purchaseId: `sub-account-${offer}`, customerId: `cust-account-${offer}`, planId: 'robo-exemplo-a', offer });
		const { cookieValue } = await createSession(env, `cust-account-${offer}`);

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({ ok: true, robots: [{ licenses: [{ canCancel: false }] }] });
	});

	it('does not offer cancel once a Mensal is canceled', async () => {
		await seedAccount({ purchaseId: 'sub-account-canceled', customerId: 'cust-account-canceled', planId: 'robo-exemplo-a' });
		await env.DB.prepare("UPDATE purchases SET status = 'canceled' WHERE id = ?").bind('sub-account-canceled').run();
		const { cookieValue } = await createSession(env, 'cust-account-canceled');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({ ok: true, robots: [{ licenses: [{ canCancel: false }] }] });
	});

	it('lists every Licença of one email on one page, grouped by Robô', async () => {
		await seedAccount({ purchaseId: 'multi-1', customerId: 'cust-multi', planId: 'robo-exemplo-a', email: 'multi@example.com' });
		await seedAccount({ purchaseId: 'multi-2', customerId: 'cust-multi-other', planId: 'robo-exemplo-b', email: 'multi@example.com' });
		await seedAccount({ purchaseId: 'multi-3', customerId: 'cust-multi-third', planId: 'robo-exemplo-a', email: 'multi@example.com', offer: 'one_time' });
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status) VALUES (?, ?, ?)')
			.bind('multi-2', 'robo-exemplo-b', 'awaiting_account')
			.run();
		const { cookieValue } = await createSession(env, 'cust-multi');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({
			ok: true,
			robots: [
				{
					robotName: 'Robô Exemplo A',
					licenses: [
						{ purchaseId: 'multi-1', offer: 'monthly', corretoraAccount: null, canCancel: true, license: { status: 'none' }, subscriptionStatus: 'active' },
						{ purchaseId: 'multi-3', offer: 'one_time', corretoraAccount: null, canCancel: false, license: { status: 'none' }, subscriptionStatus: 'active' },
					],
				},
				{
					robotName: 'Robô Exemplo B',
					licenses: [
						{ purchaseId: 'multi-2', offer: 'monthly', corretoraAccount: null, canCancel: true, license: { status: 'awaiting_account' }, subscriptionStatus: 'active' },
					],
				},
			],
		});
	});

	it("shows the Corretora account the Cliente entered, per Licença, and null before that", async () => {
		await seedAccount({ purchaseId: 'acct-1', customerId: 'cust-acct', planId: 'robo-exemplo-a', email: 'acct@example.com' });
		await seedAccount({ purchaseId: 'acct-2', customerId: 'cust-acct-other', planId: 'robo-exemplo-a', email: 'acct@example.com', offer: 'annual' });
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, corretora_account) VALUES (?, ?, ?, ?)')
			.bind('acct-1', 'robo-exemplo-a', 'preparing', 123456)
			.run();
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status) VALUES (?, ?, ?)')
			.bind('acct-2', 'robo-exemplo-a', 'awaiting_account')
			.run();
		const { cookieValue } = await createSession(env, 'cust-acct');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({
			ok: true,
			robots: [
				{
					licenses: [
						{ purchaseId: 'acct-1', offer: 'monthly', corretoraAccount: 123456 },
						{ purchaseId: 'acct-2', offer: 'annual', corretoraAccount: null },
					],
				},
			],
		});
	});

	it("does not list another Cliente's Licenças", async () => {
		await seedAccount({ purchaseId: 'iso-1', customerId: 'cust-iso-1', planId: 'robo-exemplo-a' });
		await seedAccount({ purchaseId: 'iso-2', customerId: 'cust-iso-2', planId: 'robo-exemplo-a' });
		const { cookieValue } = await createSession(env, 'cust-iso-1');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toMatchObject({ ok: true, robots: [{ licenses: [{ purchaseId: 'iso-1' }] }] });
	});

	it('redirects (ok: false) when the session is valid but no customers row matches — no account to show', async () => {
		const { cookieValue } = await createSession(env, 'cust-account-orphan');

		const result = await resolveAccountView(env, requestWithCookie(cookieValue));

		expect(result).toEqual({ ok: false });
	});
});
