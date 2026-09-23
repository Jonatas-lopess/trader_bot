import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getLicenseStatus } from './license-status';

async function seedSubscription(id: string) {
	await env.DB.prepare('INSERT INTO subscriptions (id, plan_id, status) VALUES (?, ?, ?)')
		.bind(id, 'starter', 'active')
		.run();
}

describe('getLicenseStatus', () => {
	it('reports "preparing" when no licenses row exists yet', async () => {
		await seedSubscription('sub-license-none');

		expect(await getLicenseStatus(env, 'sub-license-none')).toEqual({ status: 'preparing', expiresAt: null });
	});

	it('reports "preparing" when a row exists but expires_at is unset', async () => {
		await seedSubscription('sub-license-unset');
		await env.DB.prepare('INSERT INTO licenses (subscription_id) VALUES (?)').bind('sub-license-unset').run();

		expect(await getLicenseStatus(env, 'sub-license-unset')).toEqual({ status: 'preparing', expiresAt: null });
	});

	it('reports "active" with the expiry once expires_at is set', async () => {
		await seedSubscription('sub-license-active');
		await env.DB.prepare('INSERT INTO licenses (subscription_id, status, expires_at) VALUES (?, ?, ?)')
			.bind('sub-license-active', 'active', '2027-03-15T00:00:00.000Z')
			.run();

		expect(await getLicenseStatus(env, 'sub-license-active')).toEqual({
			status: 'active',
			expiresAt: '2027-03-15T00:00:00.000Z',
		});
	});
});
