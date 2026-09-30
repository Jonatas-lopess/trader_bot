import { env } from 'cloudflare:workers';
import { seedCustomer } from '../../../test/customer-seed';
import { describe, expect, it } from 'vitest';
import { findDuplicateLicense } from './duplicate-license';

const NOW = new Date('2026-09-29T12:00:00.000Z');

async function seed(params: {
	id: string;
	email: string;
	robotId?: string;
	purchaseStatus?: string;
	expiresAt?: string | null;
	noLicense?: boolean;
}) {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'one_time', 0, ?)")
		.bind(params.id, params.robotId ?? 'robo-a', params.purchaseStatus ?? 'active')
		.run();
	await seedCustomer({ purchaseId: params.id, customerId: `cust-${params.id}`, email: params.email });
	if (params.noLicense) return;
	await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, expires_at) VALUES (?, ?, ?)')
		.bind(params.id, params.robotId ?? 'robo-a', params.expiresAt === undefined ? '9999-12-31T23:59:59.000Z' : params.expiresAt)
		.run();
}

describe('findDuplicateLicense', () => {
	it('finds another live Licença for the same email and Robô', async () => {
		await seed({ id: 'dup-first', email: 'dup1@example.com' });
		await seed({ id: 'dup-second', email: 'dup1@example.com' });

		expect(await findDuplicateLicense(env, { purchaseId: 'dup-second', email: 'dup1@example.com', now: NOW })).toBe('dup-first');
	});

	it('matches the email case-insensitively', async () => {
		await seed({ id: 'dup-case-a', email: 'dup2@example.com' });
		await seed({ id: 'dup-case-b', email: 'dup2@example.com' });

		expect(await findDuplicateLicense(env, { purchaseId: 'dup-case-b', email: 'DUP2@Example.com', now: NOW })).toBe('dup-case-a');
	});

	it('ignores the purchase itself', async () => {
		await seed({ id: 'dup-alone', email: 'dup3@example.com' });

		expect(await findDuplicateLicense(env, { purchaseId: 'dup-alone', email: 'dup3@example.com', now: NOW })).toBeNull();
	});

	it('ignores a different Robô, a different email, a revoked purchase and an expired Licença', async () => {
		await seed({ id: 'dup-other-robot', email: 'dup4@example.com', robotId: 'robo-b' });
		await seed({ id: 'dup-other-email', email: 'someone-else@example.com' });
		await seed({ id: 'dup-refunded', email: 'dup4@example.com', purchaseStatus: 'refunded' });
		await seed({ id: 'dup-expired', email: 'dup4@example.com', expiresAt: '2026-01-01T00:00:00.000Z' });
		await seed({ id: 'dup-nolicense', email: 'dup4@example.com', noLicense: true });
		await seed({ id: 'dup-new', email: 'dup4@example.com' });

		expect(await findDuplicateLicense(env, { purchaseId: 'dup-new', email: 'dup4@example.com', now: NOW })).toBeNull();
	});
});
