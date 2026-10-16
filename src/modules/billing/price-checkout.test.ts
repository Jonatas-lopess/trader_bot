import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { expandLines } from './checkout-lines';
import { priceCheckout } from './price-checkout';

beforeEach(async () => {
	await clearCatalog();
	await seedRobot({ slug: 'robo-a', name: 'Robô A', offers: { one_time: 29700, annual: 19700 } });
	await seedRobot({ slug: 'robo-b', name: 'Robô B', offers: { one_time: 49900 } });
	await seedRobot({ slug: 'robo-draft', status: 'draft', offers: { one_time: 100 } });
});

describe('expandLines (pure)', () => {
	it('expands quantity into one row per Licença and sums the total', () => {
		const result = expandLines([
			{ robotId: 'a', offer: 'one_time', name: 'A', unitCents: 100, quantity: 3 },
			{ robotId: 'b', offer: 'annual', name: 'B', unitCents: 250, quantity: 1 },
		]);
		expect(result.rows).toEqual([
			{ robotId: 'a', offer: 'one_time', amountCents: 100 },
			{ robotId: 'a', offer: 'one_time', amountCents: 100 },
			{ robotId: 'a', offer: 'one_time', amountCents: 100 },
			{ robotId: 'b', offer: 'annual', amountCents: 250 },
		]);
		expect(result.totalCents).toBe(550);
		expect(result.products).toEqual([
			{ sku: 'a:one_time', name: 'A', quantity: 3, unit_value: 100, type: 'digital' },
			{ sku: 'b:annual', name: 'B', quantity: 1, unit_value: 250, type: 'digital' },
		]);
	});
});

describe('priceCheckout', () => {
	it('prices a 2-line, quantity-3 cart into 4 rows and the right total from D1', async () => {
		const result = await priceCheckout(env, [
			{ robotId: 'robo-a', offer: 'one_time', quantity: 3 },
			{ robotId: 'robo-b', offer: 'one_time', quantity: 1 },
		]);
		expect(result).toEqual({
			ok: true,
			lines: [
				{ robotId: 'robo-a', offer: 'one_time', name: 'Robô A', unitCents: 29700, quantity: 3 },
				{ robotId: 'robo-b', offer: 'one_time', name: 'Robô B', unitCents: 49900, quantity: 1 },
			],
			rows: [
				{ robotId: 'robo-a', offer: 'one_time', amountCents: 29700 },
				{ robotId: 'robo-a', offer: 'one_time', amountCents: 29700 },
				{ robotId: 'robo-a', offer: 'one_time', amountCents: 29700 },
				{ robotId: 'robo-b', offer: 'one_time', amountCents: 49900 },
			],
			totalCents: 3 * 29700 + 49900,
			products: [
				{ sku: 'robo-a:one_time', name: 'Robô A', quantity: 3, unit_value: 29700, type: 'digital' },
				{ sku: 'robo-b:one_time', name: 'Robô B', quantity: 1, unit_value: 49900, type: 'digital' },
			],
		});
	});

	it('ignores any price the client sends along', async () => {
		const result = await priceCheckout(env, [
			{ robotId: 'robo-a', offer: 'annual', quantity: 1, priceCents: 1, amountCents: 1, unit_value: 1 } as never,
		]);
		expect(result).toMatchObject({ ok: true, totalCents: 19700 });
	});

	it('rejects the whole checkout when one line is unknown, unpublished or not sold', async () => {
		const good = { robotId: 'robo-a', offer: 'one_time', quantity: 1 };
		expect(await priceCheckout(env, [good, { robotId: 'nope', offer: 'one_time', quantity: 1 }])).toEqual({
			ok: false,
			reason: 'unknown_robot',
			line: 1,
		});
		expect(await priceCheckout(env, [good, { robotId: 'robo-draft', offer: 'one_time', quantity: 1 }])).toEqual({
			ok: false,
			reason: 'unknown_robot',
			line: 1,
		});
		expect(await priceCheckout(env, [good, { robotId: 'robo-b', offer: 'annual', quantity: 1 }])).toEqual({
			ok: false,
			reason: 'unknown_offer',
			line: 1,
		});
		// Mensal is on standby: not an offer the cart can carry.
		expect(await priceCheckout(env, [good, { robotId: 'robo-a', offer: 'monthly', quantity: 1 }])).toEqual({
			ok: false,
			reason: 'unknown_offer',
			line: 1,
		});
	});

	it('does not let repeated lines of the same Robô and offer bypass the per-line cap', async () => {
		const same = { robotId: 'robo-a', offer: 'one_time', quantity: 5 };
		expect(await priceCheckout(env, Array.from({ length: 20 }, () => same))).toMatchObject({
			ok: false,
			reason: 'quantity_over_cap',
		});
		expect(
			await priceCheckout(env, [
				{ robotId: 'robo-a', offer: 'one_time', quantity: 2 },
				{ robotId: 'robo-a', offer: 'one_time', quantity: 4 },
			]),
		).toEqual({ ok: false, reason: 'quantity_over_cap', line: 1 });

		const merged = await priceCheckout(env, [
			{ robotId: 'robo-a', offer: 'one_time', quantity: 2 },
			{ robotId: 'robo-b', offer: 'one_time', quantity: 1 },
			{ robotId: 'robo-a', offer: 'one_time', quantity: 3 },
		]);
		expect(merged).toMatchObject({ ok: true, totalCents: 5 * 29700 + 49900 });
		expect(merged.ok && merged.rows).toHaveLength(6);
		expect(merged.ok && merged.products).toEqual([
			{ sku: 'robo-a:one_time', name: 'Robô A', quantity: 5, unit_value: 29700, type: 'digital' },
			{ sku: 'robo-b:one_time', name: 'Robô B', quantity: 1, unit_value: 49900, type: 'digital' },
		]);

		// Same Robô under a different offer is a different line: not merged.
		expect(
			await priceCheckout(env, [
				{ robotId: 'robo-a', offer: 'one_time', quantity: 5 },
				{ robotId: 'robo-a', offer: 'annual', quantity: 5 },
			]),
		).toMatchObject({ ok: true });
	});

	it('rejects an empty cart, a bad quantity, and non-string ids', async () => {
		expect(await priceCheckout(env, [])).toEqual({ ok: false, reason: 'empty' });
		for (const quantity of [0, -1, 1.5, 6, '2', null, Number.NaN]) {
			expect(await priceCheckout(env, [{ robotId: 'robo-a', offer: 'one_time', quantity }])).toEqual({
				ok: false,
				reason: 'invalid_quantity',
				line: 0,
			});
		}
		expect(await priceCheckout(env, [{ robotId: 7, offer: 'one_time', quantity: 1 }])).toEqual({
			ok: false,
			reason: 'unknown_robot',
			line: 0,
		});
		const many = Array.from({ length: 21 }, () => ({ robotId: 'robo-a', offer: 'one_time', quantity: 1 }));
		expect(await priceCheckout(env, many)).toEqual({ ok: false, reason: 'too_many_lines' });
	});
});
