import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_CART_LINES, MAX_LINE_QUANTITY, parseCartLines, priceCart, summarizeCart } from './price-cart';
import { listPublishedWithOffers } from './robots';
import { clearCatalog, seedRobot } from './test-helpers';

const allowAll = { limit: async () => ({ success: true }) };
const denyAll = { limit: async () => ({ success: false }) };
const summaryEnv = { ...env, CART_RATE_LIMITER: allowAll };
const post = (body: unknown, e: Parameters<typeof summarizeCart>[0] = summaryEnv) =>
	summarizeCart(e, { sourceIp: '203.0.113.7', rawBody: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(async () => {
	await clearCatalog();
	await seedRobot({ slug: 'robo-a', name: 'Robô A', offers: { one_time: 99700, annual: 49700 } });
	await seedRobot({ slug: 'robo-b', name: 'Robô B', offers: { one_time: 149700 } });
	await seedRobot({ slug: 'robo-soon', name: 'Robô Soon', status: 'coming-soon' });
	await seedRobot({ slug: 'robo-draft', name: 'Segredo Rascunho', status: 'draft', offers: { one_time: 1000 } });
	await seedRobot({ slug: 'robo-old', name: 'Robô Velho', status: 'archived', offers: { one_time: 1000 } });
});

describe('parseCartLines', () => {
	const ok = (lines: unknown) => parseCartLines({ lines });

	it('accepts well-formed lines', () => {
		expect(ok([{ robot: 'robo-a', offer: 'one_time', quantity: 2 }])).toEqual({
			ok: true,
			lines: [{ robot: 'robo-a', offer: 'one_time', quantity: 2 }],
		});
		expect(ok([])).toEqual({ ok: true, lines: [] });
	});

	it('rejects a body that is not an object with a lines array', () => {
		for (const body of [null, 'x', 5, [], {}, { lines: 'x' }, { lines: {} }]) {
			expect(parseCartLines(body).ok).toBe(false);
		}
	});

	it('rejects an unknown offer, including monthly', () => {
		for (const offer of ['monthly', 'lifetime', '', 7, null, undefined]) {
			expect(ok([{ robot: 'robo-a', offer, quantity: 1 }]).ok).toBe(false);
		}
	});

	it('rejects a quantity outside 1..max or not a whole number', () => {
		for (const quantity of [0, -1, MAX_LINE_QUANTITY + 1, 1.5, '2', null, NaN, Infinity]) {
			expect(ok([{ robot: 'robo-a', offer: 'one_time', quantity }]).ok).toBe(false);
		}
		expect(ok([{ robot: 'robo-a', offer: 'one_time', quantity: MAX_LINE_QUANTITY }]).ok).toBe(true);
	});

	it('rejects a robot that is not a kebab-case slug', () => {
		for (const robot of ['', 'Robo A', "robo'; DROP TABLE robots;--", 'a'.repeat(65), 7, null]) {
			expect(ok([{ robot, offer: 'one_time', quantity: 1 }]).ok).toBe(false);
		}
	});

	it('rejects too many lines and a repeated Robô + Oferta', () => {
		const many = Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({ robot: `robo-${i}`, offer: 'one_time', quantity: 1 }));
		expect(ok(many).ok).toBe(false);
		expect(ok(many.slice(0, MAX_CART_LINES)).ok).toBe(true);
		const twice = { robot: 'robo-a', offer: 'one_time', quantity: 1 };
		expect(ok([twice, twice]).ok).toBe(false);
	});

	it('rejects a line that is not an object', () => {
		expect(ok([null]).ok).toBe(false);
		expect(ok(['robo-a']).ok).toBe(false);
	});

	it('never carries a price from the request into the parsed lines', () => {
		const parsed = ok([{ robot: 'robo-a', offer: 'one_time', quantity: 1, priceCents: 1, unitCents: 1, name: 'x' }]);
		expect(parsed).toEqual({ ok: true, lines: [{ robot: 'robo-a', offer: 'one_time', quantity: 1 }] });
	});
});

describe('priceCart', () => {
	it('prices each line from the catalog and totals them', async () => {
		const published = await listPublishedWithOffers(env);
		const result = priceCart(
			[
				{ robot: 'robo-a', offer: 'one_time', quantity: 2 },
				{ robot: 'robo-a', offer: 'annual', quantity: 1 },
				{ robot: 'robo-b', offer: 'one_time', quantity: 1 },
			],
			published
		);
		expect(result.lines).toEqual([
			{ robot: 'robo-a', offer: 'one_time', quantity: 2, name: 'Robô A', unitCents: 99700, lineCents: 199400, available: true },
			{ robot: 'robo-a', offer: 'annual', quantity: 1, name: 'Robô A', unitCents: 49700, lineCents: 49700, available: true },
			{ robot: 'robo-b', offer: 'one_time', quantity: 1, name: 'Robô B', unitCents: 149700, lineCents: 149700, available: true },
		]);
		expect(result.totalCents).toBe(398800);
	});

	it('flags a line unavailable, with no price, and leaves it out of the total', async () => {
		const published = await listPublishedWithOffers(env);
		const result = priceCart(
			[
				{ robot: 'robo-a', offer: 'one_time', quantity: 1 },
				{ robot: 'robo-b', offer: 'annual', quantity: 1 }, // published, does not sell Anual
				{ robot: 'robo-soon', offer: 'one_time', quantity: 1 }, // coming soon
				{ robot: 'robo-draft', offer: 'one_time', quantity: 1 },
				{ robot: 'robo-old', offer: 'one_time', quantity: 1 },
				{ robot: 'robo-nope', offer: 'one_time', quantity: 1 },
			],
			published
		);
		expect(result.lines.map((l) => l.available)).toEqual([true, false, false, false, false, false]);
		for (const line of result.lines.slice(1)) {
			expect(line.unitCents).toBeNull();
			expect(line.lineCents).toBeNull();
		}
		expect(result.totalCents).toBe(99700);
	});

	it('names a published Robô even when the line is unavailable, never a draft or archived one', async () => {
		const published = await listPublishedWithOffers(env);
		const names = Object.fromEntries(
			priceCart(
				[
					{ robot: 'robo-b', offer: 'annual', quantity: 1 },
					{ robot: 'robo-draft', offer: 'one_time', quantity: 1 },
					{ robot: 'robo-old', offer: 'one_time', quantity: 1 },
				],
				published
			).lines.map((l) => [l.robot, l.name])
		);
		expect(names).toEqual({ 'robo-b': 'Robô B', 'robo-draft': null, 'robo-old': null });
	});

	it('is a total of zero for an empty cart', () => {
		expect(priceCart([], [])).toEqual({ lines: [], totalCents: 0 });
	});
});

describe('summarizeCart (POST /cart/summary)', () => {
	it('prices a valid cart from D1', async () => {
		const result = await post({ lines: [{ robot: 'robo-a', offer: 'annual', quantity: 3 }] });
		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			lines: [{ robot: 'robo-a', offer: 'annual', quantity: 3, name: 'Robô A', unitCents: 49700, lineCents: 149100, available: true }],
			totalCents: 149100,
		});
	});

	it('follows a price change and an unpublish between calls', async () => {
		const cart = { lines: [{ robot: 'robo-b', offer: 'one_time', quantity: 1 }] };
		await env.DB.prepare("UPDATE robot_offers SET price_cents = 120000 WHERE robot_slug = 'robo-b'").run();
		expect((await post(cart)).body).toMatchObject({ totalCents: 120000 });
		await env.DB.prepare("UPDATE robots SET status = 'draft' WHERE slug = 'robo-b'").run();
		expect((await post(cart)).body).toMatchObject({ totalCents: 0, lines: [{ available: false, name: null, unitCents: null }] });
	});

	it('ignores every price the client sends', async () => {
		const result = await post({
			lines: [{ robot: 'robo-a', offer: 'one_time', quantity: 1, priceCents: 1, unitCents: 1, lineCents: 1 }],
			totalCents: 1,
		});
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ totalCents: 99700 });
	});

	it('answers 400 to tampered or malformed input', async () => {
		const bad: unknown[] = [
			'{not json',
			'',
			'null',
			{ lines: [{ robot: 'robo-a', offer: 'monthly', quantity: 1 }] },
			{ lines: [{ robot: 'robo-a', offer: 'one_time', quantity: 6 }] },
			{ lines: [{ robot: 'robo-a', offer: 'one_time', quantity: -1 }] },
			{ lines: [{ robot: "x' OR 1=1 --", offer: 'one_time', quantity: 1 }] },
			{ lines: 'robo-a' },
			{ lines: Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({ robot: `r-${i}`, offer: 'one_time', quantity: 1 })) },
			'x'.repeat(20_000),
		];
		for (const body of bad) {
			const result = await post(body);
			expect(result.status).toBe(400);
			expect(result.body).toEqual({ error: 'invalid_cart' });
		}
	});

	it('answers 429 when the caller is over the rate limit, before reading anything', async () => {
		const result = await post({ lines: [] }, { ...env, CART_RATE_LIMITER: denyAll });
		expect(result.status).toBe(429);
	});

	it('keys the rate limit on the source IP', async () => {
		const keys: string[] = [];
		const spy = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) };
		await post({ lines: [] }, { ...env, CART_RATE_LIMITER: spy });
		expect(keys).toEqual(['203.0.113.7']);
	});
});
