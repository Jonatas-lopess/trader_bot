import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCustomerByPurchaseId, provisionCustomer } from './customers';

async function seedPurchase(id: string, robotId = 'robo-exemplo-a') {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'one_time', 0, 'active')")
		.bind(id, robotId)
		.run();
}

async function customerCount(): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM customers').first<{ n: number }>();
	return row!.n;
}

describe('provisionCustomer', () => {
	// D1 state is shared across tests in a file, and these assert on row counts.
	beforeEach(async () => {
		await env.DB.batch([env.DB.prepare('DELETE FROM customers'), env.DB.prepare('DELETE FROM purchases')]);
	});

	it('creates the customer and attaches the purchase', async () => {
		await seedPurchase('p-1');

		const result = await provisionCustomer(env, { purchaseId: 'p-1', email: 'ana@example.com' });

		expect(result).toMatchObject({ created: true });
		expect(await getCustomerByPurchaseId(env, 'p-1')).toEqual({ id: result!.id, email: 'ana@example.com' });
	});

	it('two purchases by the same email yield one customers row', async () => {
		await seedPurchase('p-a');
		await seedPurchase('p-b', 'robo-exemplo-b');

		const first = await provisionCustomer(env, { purchaseId: 'p-a', email: 'ana@example.com' });
		const second = await provisionCustomer(env, { purchaseId: 'p-b', email: 'ana@example.com' });

		expect(second!.id).toBe(first!.id);
		expect(second!.created).toBe(true);
		expect(await customerCount()).toBe(1);
		const { results } = await env.DB.prepare('SELECT id FROM purchases WHERE customer_id = ? ORDER BY id').bind(first!.id).all();
		expect(results.map((r) => r.id)).toEqual(['p-a', 'p-b']);
	});

	it('resolves the same customer for the same email in a different casing or with whitespace', async () => {
		await seedPurchase('p-c1');
		await seedPurchase('p-c2');

		const first = await provisionCustomer(env, { purchaseId: 'p-c1', email: 'ana@example.com' });
		const second = await provisionCustomer(env, { purchaseId: 'p-c2', email: '  Ana@Example.COM ' });

		expect(second!.id).toBe(first!.id);
		expect(await customerCount()).toBe(1);
	});

	it('keeps plus-aliases as distinct customers', async () => {
		await seedPurchase('p-d1');
		await seedPurchase('p-d2');

		await provisionCustomer(env, { purchaseId: 'p-d1', email: 'ana@example.com' });
		await provisionCustomer(env, { purchaseId: 'p-d2', email: 'ana+x@example.com' });

		expect(await customerCount()).toBe(2);
	});

	it('is idempotent for a reapplied event on the same purchase: created is false', async () => {
		await seedPurchase('p-e');

		const first = await provisionCustomer(env, { purchaseId: 'p-e', email: 'ana@example.com' });
		const again = await provisionCustomer(env, { purchaseId: 'p-e', email: 'ana@example.com' });

		expect(first!.created).toBe(true);
		expect(again).toEqual({ id: first!.id, created: false });
		expect(await customerCount()).toBe(1);
	});

	it('returns null and writes nothing for a malformed email', async () => {
		await seedPurchase('p-f');

		expect(await provisionCustomer(env, { purchaseId: 'p-f', email: 'not-an-email' })).toBeNull();
		expect(await customerCount()).toBe(0);
	});
});
