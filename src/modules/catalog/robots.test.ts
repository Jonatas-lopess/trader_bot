import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	getPublishedBySlug,
	listOffersFor,
	listPublished,
	listPublishedWithOffers,
	listRobotNames,
	lookupOffer,
} from './robots';
import { clearCatalog, seedRobot } from './test-helpers';

beforeEach(clearCatalog);

describe('catalog D1 schema (migration 0012)', () => {
	it('defaults a new Robô to draft', async () => {
		await env.DB.prepare("INSERT INTO robots (slug, name, short_description, strategy_type) VALUES ('r', 'R', 's', 't')").run();
		const row = await env.DB.prepare("SELECT status, sort_order, long_description FROM robots WHERE slug = 'r'").first();
		expect(row).toEqual({ status: 'draft', sort_order: 0, long_description: '' });
	});

	it('rejects a status outside the lifecycle', async () => {
		await expect(seedRobot({ slug: 'bad', status: 'live' as never })).rejects.toThrow();
	});

	it('rejects the monthly offer: Mensal is on standby', async () => {
		await seedRobot({ slug: 'robo-a' });
		await expect(
			env.DB.prepare("INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES ('robo-a', 'monthly', 9700)").run()
		).rejects.toThrow();
	});

	it('rejects a negative price and a duplicate (robot, offer)', async () => {
		await seedRobot({ slug: 'robo-a', offers: { one_time: 100 } });
		await expect(
			env.DB.prepare("INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES ('robo-a', 'annual', -1)").run()
		).rejects.toThrow();
		await expect(
			env.DB.prepare("INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES ('robo-a', 'one_time', 200)").run()
		).rejects.toThrow();
	});
});

describe('listPublished', () => {
	it('returns available and coming-soon Robôs by sort_order, excluding draft and archived', async () => {
		await seedRobot({ slug: 'c-third', status: 'coming-soon', sortOrder: 30 });
		await seedRobot({ slug: 'a-first', sortOrder: 10 });
		await seedRobot({ slug: 'hidden-draft', status: 'draft', sortOrder: 5 });
		await seedRobot({ slug: 'old-archived', status: 'archived', sortOrder: 1 });
		await seedRobot({ slug: 'b-second', sortOrder: 20 });

		const robots = await listPublished(env);

		expect(robots.map((r) => r.slug)).toEqual(['a-first', 'b-second', 'c-third']);
	});

	it('breaks sort_order ties by slug so the order is stable', async () => {
		await seedRobot({ slug: 'zeta' });
		await seedRobot({ slug: 'alfa' });

		expect((await listPublished(env)).map((r) => r.slug)).toEqual(['alfa', 'zeta']);
	});

	it('is empty when nothing is published', async () => {
		await seedRobot({ slug: 'only-draft', status: 'draft' });

		expect(await listPublished(env)).toEqual([]);
	});
});

describe('getPublishedBySlug', () => {
	it('maps every column and round-trips the JSON arrays', async () => {
		await seedRobot({
			slug: 'robo-a',
			name: 'Robô A',
			shortDescription: 'curta',
			longDescription: 'longa',
			strategyType: 'Rompimento',
			market: ['Mini Índice', 'Mini Dólar'],
			perfil: 'Conservador / Médio Prazo',
			supportedCorretoras: ['Corretora Exemplo'],
			sortOrder: 7,
		});

		expect(await getPublishedBySlug(env, 'robo-a')).toEqual({
			slug: 'robo-a',
			name: 'Robô A',
			shortDescription: 'curta',
			longDescription: 'longa',
			strategyType: 'Rompimento',
			market: ['Mini Índice', 'Mini Dólar'],
			perfil: 'Conservador / Médio Prazo',
			supportedCorretoras: ['Corretora Exemplo'],
			status: 'available',
			sortOrder: 7,
		});
	});

	it('returns null for the optional columns when absent', async () => {
		await seedRobot({ slug: 'robo-b', status: 'coming-soon' });

		expect(await getPublishedBySlug(env, 'robo-b')).toMatchObject({
			market: null,
			perfil: null,
			supportedCorretoras: null,
			status: 'coming-soon',
		});
	});

	it('treats a malformed JSON array as absent rather than throwing', async () => {
		await seedRobot({ slug: 'robo-c' });
		await env.DB.prepare("UPDATE robots SET market = 'not json', supported_corretoras = '{\"a\":1}' WHERE slug = 'robo-c'").run();

		expect(await getPublishedBySlug(env, 'robo-c')).toMatchObject({ market: null, supportedCorretoras: null });
	});

	it('does not find unknown, draft or archived slugs', async () => {
		await seedRobot({ slug: 'robo-d', status: 'draft' });
		await seedRobot({ slug: 'robo-e', status: 'archived' });

		expect(await getPublishedBySlug(env, 'robo-d')).toBeNull();
		expect(await getPublishedBySlug(env, 'robo-e')).toBeNull();
		expect(await getPublishedBySlug(env, 'nope')).toBeNull();
	});
});

describe('listOffersFor', () => {
	it('lists the offers an available Robô sells, in price cents, Compra first', async () => {
		await seedRobot({ slug: 'robo-a', offers: { annual: 49700, one_time: 99700 } });

		expect(await listOffersFor(env, 'robo-a')).toEqual([
			{ offer: 'one_time', priceCents: 99700 },
			{ offer: 'annual', priceCents: 49700 },
		]);
	});

	it('is empty for a Robô that sells nothing, and for unknown, draft, archived and coming-soon Robôs', async () => {
		await seedRobot({ slug: 'no-offers' });
		await seedRobot({ slug: 'draft', status: 'draft', offers: { one_time: 100 } });
		await seedRobot({ slug: 'archived', status: 'archived', offers: { one_time: 100 } });
		await seedRobot({ slug: 'soon', status: 'coming-soon', offers: { one_time: 100 } });

		for (const slug of ['no-offers', 'draft', 'archived', 'soon', 'nope']) {
			expect(await listOffersFor(env, slug)).toEqual([]);
		}
	});
});

describe('lookupOffer', () => {
	it('returns the price in cents for an available Robô and an offered Oferta', async () => {
		await seedRobot({ slug: 'robo-a', offers: { one_time: 99700, annual: 49700 } });

		expect(await lookupOffer(env, 'robo-a', 'one_time')).toEqual({ kind: 'found', amountCents: 99700 });
		expect(await lookupOffer(env, 'robo-a', 'annual')).toEqual({ kind: 'found', amountCents: 49700 });
	});

	it('prices a free Oferta as found, not as missing', async () => {
		await seedRobot({ slug: 'robo-a', offers: { one_time: 0 } });

		expect(await lookupOffer(env, 'robo-a', 'one_time')).toEqual({ kind: 'found', amountCents: 0 });
	});

	it('rejects an unknown Robô', async () => {
		expect(await lookupOffer(env, 'nope', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});

	it('rejects an Oferta the Robô does not sell, and any name that is not an Oferta', async () => {
		await seedRobot({ slug: 'robo-a', offers: { one_time: 99700 } });

		expect(await lookupOffer(env, 'robo-a', 'annual')).toEqual({ kind: 'unknown_offer' });
		expect(await lookupOffer(env, 'robo-a', 'monthly')).toEqual({ kind: 'unknown_offer' });
		expect(await lookupOffer(env, 'robo-a', 'constructor')).toEqual({ kind: 'unknown_offer' });
		expect(await lookupOffer(env, 'robo-a', '')).toEqual({ kind: 'unknown_offer' });
	});

	it('rejects draft and archived Robôs as unknown, even with offer rows', async () => {
		await seedRobot({ slug: 'robo-d', status: 'draft', offers: { one_time: 100 } });
		await seedRobot({ slug: 'robo-e', status: 'archived', offers: { one_time: 100 } });

		expect(await lookupOffer(env, 'robo-d', 'one_time')).toEqual({ kind: 'unknown_robot' });
		expect(await lookupOffer(env, 'robo-e', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});

	it('does not sell a coming-soon Robô even if an offer row exists', async () => {
		await seedRobot({ slug: 'robo-f', status: 'coming-soon', offers: { one_time: 100 } });

		expect(await lookupOffer(env, 'robo-f', 'one_time')).toEqual({ kind: 'unknown_offer' });
	});

	it('does not match a slug by pattern or case', async () => {
		await seedRobot({ slug: 'robo-a', offers: { one_time: 100 } });

		expect(await lookupOffer(env, 'ROBO-A', 'one_time')).toEqual({ kind: 'unknown_robot' });
		expect(await lookupOffer(env, 'robo-%', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});
});

describe('listPublishedWithOffers', () => {
	it('pairs each published Robô with its Ofertas, Compra first, in listing order', async () => {
		await seedRobot({ slug: 'a-first', sortOrder: 10, offers: { annual: 49700, one_time: 99700 } });
		await seedRobot({ slug: 'b-second', sortOrder: 20, offers: { one_time: 149700 } });
		await seedRobot({ slug: 'c-soon', status: 'coming-soon', sortOrder: 30, offers: { one_time: 1 } });
		await seedRobot({ slug: 'hidden-draft', status: 'draft', offers: { one_time: 1 } });

		const entries = await listPublishedWithOffers(env);

		expect(entries.map((e) => [e.slug, e.offers])).toEqual([
			[
				'a-first',
				[
					{ offer: 'one_time', priceCents: 99700 },
					{ offer: 'annual', priceCents: 49700 },
				],
			],
			['b-second', [{ offer: 'one_time', priceCents: 149700 }]],
			['c-soon', []],
		]);
	});

	it('is empty when nothing is published', async () => {
		expect(await listPublishedWithOffers(env)).toEqual([]);
	});
});

describe('listRobotNames', () => {
	it('names every Robô whatever its status, so a past purchase of an archived one still resolves', async () => {
		await seedRobot({ slug: 'live', name: 'Robô Live' });
		await seedRobot({ slug: 'old', name: 'Robô Old', status: 'archived' });

		const names = await listRobotNames(env);

		expect(names.get('live')).toBe('Robô Live');
		expect(names.get('old')).toBe('Robô Old');
		expect(names.get('missing')).toBeUndefined();
	});
});
