import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getLicenseStatus } from './license-status';

const NOW = new Date('2026-09-29T12:00:00.000Z');

async function seedPurchase(id: string, status = 'active') {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'monthly', 0, ?)")
		.bind(id, 'starter', status)
		.run();
}

async function seedLicense(id: string, status: string, expiresAt: string | null, account: number | null = null) {
	await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, expires_at, corretora_account) VALUES (?, ?, ?, ?, ?)')
		.bind(id, 'starter', status, expiresAt, account)
		.run();
}

describe('getLicenseStatus', () => {
	it('reports "none" when no licenses row exists (no Licença owed yet)', async () => {
		await seedPurchase('sub-license-none', 'pending');

		expect(await getLicenseStatus(env, 'sub-license-none', 'pending', NOW)).toEqual({ status: 'none' });
	});

	it('reports "revoked" for a refunded purchase even with no licenses row', async () => {
		await seedPurchase('sub-license-revoked-norow', 'refunded');

		expect(await getLicenseStatus(env, 'sub-license-revoked-norow', 'refunded', NOW)).toEqual({ status: 'revoked' });
	});

	it('reports "awaiting_account" for a fresh row with no Corretora account', async () => {
		await seedPurchase('sub-license-await');
		await seedLicense('sub-license-await', 'awaiting_account', '2027-03-15T00:00:00.000Z');

		expect(await getLicenseStatus(env, 'sub-license-await', 'active', NOW)).toEqual({ status: 'awaiting_account' });
	});

	it('reports "preparing" once the account is entered', async () => {
		await seedPurchase('sub-license-prep');
		await seedLicense('sub-license-prep', 'preparing', '2027-03-15T00:00:00.000Z', 123456);

		expect(await getLicenseStatus(env, 'sub-license-prep', 'active', NOW)).toEqual({ status: 'preparing' });
	});

	it('reports "active" with the expiry once the operator has flipped the row', async () => {
		await seedPurchase('sub-license-active');
		await seedLicense('sub-license-active', 'active', '2027-03-15T00:00:00.000Z', 123456);

		expect(await getLicenseStatus(env, 'sub-license-active', 'active', NOW)).toEqual({
			status: 'active',
			expiresAt: '2027-03-15T00:00:00.000Z',
		});
	});

	it('reports "expired" when an active row is past its expiry', async () => {
		await seedPurchase('sub-license-expired', 'canceled');
		await seedLicense('sub-license-expired', 'active', '2026-09-01T00:00:00.000Z', 123456);

		expect(await getLicenseStatus(env, 'sub-license-expired', 'canceled', NOW)).toEqual({
			status: 'expired',
			expiresAt: '2026-09-01T00:00:00.000Z',
		});
	});

	it.each(['refunded', 'chargeback'] as const)('reports "revoked" for a %s purchase, whatever the row says', async (purchaseStatus) => {
		const id = `sub-license-revoked-${purchaseStatus}`;
		await seedPurchase(id, purchaseStatus);
		await seedLicense(id, 'active', '2026-09-29T11:00:00.000Z', 123456);

		expect(await getLicenseStatus(env, id, purchaseStatus, NOW)).toEqual({ status: 'revoked' });
	});
});
