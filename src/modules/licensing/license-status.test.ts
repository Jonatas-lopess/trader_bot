import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getLicenseStatus } from './license-status';

async function seedPurchase(id: string) {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'monthly', 0, ?)")
		.bind(id, 'starter', 'active')
		.run();
}

describe('getLicenseStatus', () => {
	it('reports "preparing" when no licenses row exists yet', async () => {
		await seedPurchase('sub-license-none');

		expect(await getLicenseStatus(env, 'sub-license-none')).toEqual({ status: 'preparing', expiresAt: null });
	});

	it('reports "preparing" when a row exists but expires_at is unset', async () => {
		await seedPurchase('sub-license-unset');
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id) VALUES (?, ?)').bind('sub-license-unset', 'starter').run();

		expect(await getLicenseStatus(env, 'sub-license-unset')).toEqual({ status: 'preparing', expiresAt: null });
	});

	it('reports "active" with the expiry once expires_at is set', async () => {
		await seedPurchase('sub-license-active');
		await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, expires_at) VALUES (?, ?, ?, ?)')
			.bind('sub-license-active', 'starter', 'active', '2027-03-15T00:00:00.000Z')
			.run();

		expect(await getLicenseStatus(env, 'sub-license-active')).toEqual({
			status: 'active',
			expiresAt: '2027-03-15T00:00:00.000Z',
		});
	});
});
