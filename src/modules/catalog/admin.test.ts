import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createRobot,
	emptyRobotForm,
	formatPriceForInput,
	getRobotForAdmin,
	isSlugLocked,
	listAllRobots,
	parsePriceToCents,
	readRobotForm,
	setRobotStatus,
	toFormInput,
	updateRobot,
	validateRobotForm,
	type RobotFormInput,
} from './admin';
import { getPublishedBySlug, listOffersFor, listPublishedWithOffers, lookupOffer } from './robots';
import { clearCatalog, seedRobot } from './test-helpers';

// Purchases are not part of the catalog, so the tests that seed them clean up themselves.
beforeEach(async () => {
	await clearCatalog();
	await env.DB.prepare("DELETE FROM purchases WHERE id LIKE 'purchase-robo-%'").run();
});

const validForm = (overrides: Partial<RobotFormInput> = {}): RobotFormInput => ({
	...emptyRobotForm,
	slug: 'robo-novo',
	name: 'Robô Novo',
	shortDescription: 'Descrição curta.',
	longDescription: 'Descrição longa.',
	strategyType: 'Tendência',
	market: 'Mini Índice, Mini Dólar',
	perfil: 'Conservador',
	supportedCorretoras: 'Corretora Exemplo',
	sortOrder: '10',
	prices: { one_time: '997,00', annual: '' },
	...overrides,
});

async function seedPurchase(robotId: string, amountCents: number, id = `purchase-${robotId}`): Promise<void> {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'one_time', ?, 'active')")
		.bind(id, robotId, amountCents)
		.run();
}

/** An env whose "does this slug exist" read misses `slug`, as if another request inserted it just after. */
function staleSlugCheck(slug: string): typeof env {
	const DB = new Proxy(env.DB, {
		get(target, prop) {
			if (prop === 'prepare') {
				return (sql: string) => {
					const statement = target.prepare(sql);
					if (!sql.startsWith('SELECT 1 AS hit FROM robots WHERE slug')) return statement;
					return { bind: (value: string) => (value === slug ? { first: async () => null } : statement.bind(value)) };
				};
			}
			const value = Reflect.get(target, prop);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
	return { ...env, DB } as typeof env;
}

describe('parsePriceToCents', () => {
	it.each([
		['97', 9700],
		['97,5', 9750],
		['97,50', 9750],
		['97.50', 9750],
		['R$ 997', 99700],
		['R$997,00', 99700],
		['1.997', 199700],
		['1.997,00', 199700],
		['1,997.00', 199700],
		['12.345', 1234500],
		[' 12 ', 1200],
	])('reads %j as %i cents', (text, cents) => {
		expect(parsePriceToCents(text)).toEqual({ ok: true, cents });
	});

	it.each(['', '   '])('reads blank %j as not offered', (text) => {
		expect(parsePriceToCents(text)).toEqual({ ok: true, cents: null });
	});

	it.each(['abc', '-5', '97,555', '97,', ',50', '1e3', '9 7,00 x', '1,2,3', '1.2,34', '12..5', '1,234'])(
		'rejects %j as invalid',
		(text) => {
			expect(parsePriceToCents(text)).toEqual({ ok: false, error: 'price-invalid' });
		}
	);

	it.each(['0', '0,00', 'R$ 0', '0.00', '000'])('rejects the zero price %j: a free Oferta is not sellable', (text) => {
		expect(parsePriceToCents(text)).toEqual({ ok: false, error: 'price-zero' });
	});

	it('rejects a price above the bound and accepts the bound itself', () => {
		expect(parsePriceToCents('100000,00')).toEqual({ ok: true, cents: 10_000_000 });
		expect(parsePriceToCents('100000,01')).toEqual({ ok: false, error: 'price-too-high' });
		expect(parsePriceToCents('99999999999')).toEqual({ ok: false, error: 'price-too-high' });
		expect(parsePriceToCents('1.234.567')).toEqual({ ok: false, error: 'price-too-high' });
	});

	it('formats cents for the input and round-trips', () => {
		expect(formatPriceForInput(9750)).toBe('97,50');
		expect(formatPriceForInput(99700)).toBe('997,00');
		expect(formatPriceForInput(0)).toBe('0,00');
		for (const cents of [5, 100, 9750, 123456]) {
			expect(parsePriceToCents(formatPriceForInput(cents))).toEqual({ ok: true, cents });
		}
	});
});

describe('validateRobotForm', () => {
	it('turns a good form into a write, splitting comma lists and blanking empties', () => {
		const result = validateRobotForm(validForm({ market: ' Mini Índice , ,Mini Dólar, Mini Índice', perfil: '  ', supportedCorretoras: '' }));

		expect(result).toMatchObject({
			ok: true,
			value: {
				slug: 'robo-novo',
				market: ['Mini Índice', 'Mini Dólar'],
				perfil: null,
				supportedCorretoras: null,
				sortOrder: 10,
				offers: [{ offer: 'one_time', priceCents: 99700 }],
			},
		});
	});

	it('reports every bad field at once', () => {
		const result = validateRobotForm(
			validForm({ slug: 'Robo Novo!', name: ' ', shortDescription: '', strategyType: 'x'.repeat(61), status: 'live', sortOrder: 'abc', prices: { one_time: 'abc', annual: '-1' } })
		);

		expect(result).toEqual({
			ok: false,
			errors: {
				slug: 'slug-format',
				name: 'required',
				shortDescription: 'required',
				strategyType: 'too-long',
				status: 'invalid-status',
				sortOrder: 'invalid-number',
				price_one_time: 'price-invalid',
				price_annual: 'price-invalid',
			},
		});
	});

	it('flags a zero price on the Oferta field, while blank still means not offered', () => {
		expect(validateRobotForm(validForm({ prices: { one_time: '997,00', annual: '0,00' } }))).toEqual({
			ok: false,
			errors: { price_annual: 'price-zero' },
		});
		expect(validateRobotForm(validForm({ prices: { one_time: '997,00', annual: '' } }))).toMatchObject({ ok: true });
	});

	it.each(['-leading', 'trailing-', 'double--dash', 'with_underscore', 'accént', 'a b'])('rejects slug %j', (slug) => {
		expect(validateRobotForm(validForm({ slug }))).toMatchObject({ ok: false, errors: { slug: 'slug-format' } });
	});

	it('lower-cases and trims the slug, and reserves "new"', () => {
		expect(validateRobotForm(validForm({ slug: '  Robo-Novo ' }))).toMatchObject({ ok: true, value: { slug: 'robo-novo' } });
		expect(validateRobotForm(validForm({ slug: 'new' }))).toMatchObject({ ok: false, errors: { slug: 'slug-reserved' } });
	});

	it('requires an Oferta for an available Robô only', () => {
		const noPrices = { one_time: '', annual: '' };
		expect(validateRobotForm(validForm({ status: 'available', prices: noPrices }))).toMatchObject({
			ok: false,
			errors: { offers: 'offers-required' },
		});
		for (const status of ['draft', 'coming-soon', 'archived']) {
			expect(validateRobotForm(validForm({ status, prices: noPrices }))).toMatchObject({ ok: true });
		}
	});
});

describe('createRobot', () => {
	it('creates a draft with its Ofertas, and a draft is not public', async () => {
		const result = await createRobot(env, validForm({ prices: { one_time: '997,00', annual: '497,50' } }));

		expect(result).toEqual({ ok: true, slug: 'robo-novo' });
		expect(await getRobotForAdmin(env, 'robo-novo')).toMatchObject({
			slug: 'robo-novo',
			name: 'Robô Novo',
			market: ['Mini Índice', 'Mini Dólar'],
			status: 'draft',
			sortOrder: 10,
			offers: [
				{ offer: 'one_time', priceCents: 99700 },
				{ offer: 'annual', priceCents: 49750 },
			],
		});
		expect(await getPublishedBySlug(env, 'robo-novo')).toBeNull();
	});

	it('starts as a draft whatever status the form sends', async () => {
		await createRobot(env, validForm({ status: 'available' }));

		expect((await getRobotForAdmin(env, 'robo-novo'))?.status).toBe('draft');
	});

	it('answers slug-taken, not an error, when another create wins the slug between check and write', async () => {
		await seedRobot({ slug: 'robo-novo', name: 'Existente' });

		const result = await createRobot(staleSlugCheck('robo-novo'), validForm());

		expect(result).toEqual({ ok: false, errors: { slug: 'slug-taken' } });
		expect((await getRobotForAdmin(env, 'robo-novo'))?.name).toBe('Existente');
	});

	it('refuses a taken slug and writes nothing', async () => {
		await seedRobot({ slug: 'robo-novo', name: 'Existente' });

		const result = await createRobot(env, validForm());

		expect(result).toEqual({ ok: false, errors: { slug: 'slug-taken' } });
		expect((await getRobotForAdmin(env, 'robo-novo'))?.name).toBe('Existente');
	});

	it('returns field errors and writes nothing for an invalid form', async () => {
		const result = await createRobot(env, validForm({ name: '' }));

		expect(result).toEqual({ ok: false, errors: { name: 'required' } });
		expect(await listAllRobots(env)).toEqual([]);
	});
});

describe('updateRobot', () => {
	it('saves every field and replaces the Ofertas, a blank price removing one', async () => {
		await seedRobot({ slug: 'robo-a', status: 'available', offers: { one_time: 99700, annual: 49700 } });

		const result = await updateRobot(
			env,
			'robo-a',
			validForm({ slug: 'robo-a', name: 'Novo nome', status: 'available', prices: { one_time: '1.049,90', annual: '' } })
		);

		expect(result).toEqual({ ok: true, slug: 'robo-a' });
		expect(await getRobotForAdmin(env, 'robo-a')).toMatchObject({
			name: 'Novo nome',
			status: 'available',
			sortOrder: 10,
			offers: [{ offer: 'one_time', priceCents: 104990 }],
		});
	});

	it('returns null for an unknown slug', async () => {
		expect(await updateRobot(env, 'nope', validForm())).toBeNull();
	});

	it('returns field errors and leaves the Robô untouched', async () => {
		await seedRobot({ slug: 'robo-a', name: 'Antes', status: 'available', offers: { one_time: 99700 } });

		const result = await updateRobot(
			env,
			'robo-a',
			validForm({ slug: 'robo-a', name: 'Depois', status: 'available', prices: { one_time: '', annual: '' } })
		);

		expect(result).toEqual({ ok: false, errors: { offers: 'offers-required' } });
		expect(await getRobotForAdmin(env, 'robo-a')).toMatchObject({ name: 'Antes', offers: [{ offer: 'one_time', priceCents: 99700 }] });
	});

	it('renames the slug (with its Ofertas) while no purchase references it', async () => {
		await seedRobot({ slug: 'robo-a', status: 'available', offers: { one_time: 99700 } });

		const result = await updateRobot(env, 'robo-a', validForm({ slug: 'robo-b', status: 'available' }));

		expect(result).toEqual({ ok: true, slug: 'robo-b' });
		expect(await getRobotForAdmin(env, 'robo-a')).toBeNull();
		expect((await listOffersFor(env, 'robo-b')).map((o) => o.priceCents)).toEqual([99700]);
		expect(await listOffersFor(env, 'robo-a')).toEqual([]);
	});

	it('answers slug-taken, not an error, when the target slug appears between check and write', async () => {
		await seedRobot({ slug: 'robo-a' });
		await seedRobot({ slug: 'robo-b' });

		const result = await updateRobot(staleSlugCheck('robo-b'), 'robo-a', validForm({ slug: 'robo-b' }));

		expect(result).toEqual({ ok: false, errors: { slug: 'slug-taken' } });
		expect(await getRobotForAdmin(env, 'robo-a')).not.toBeNull();
	});

	it('refuses to rename onto another Robô slug', async () => {
		await seedRobot({ slug: 'robo-a' });
		await seedRobot({ slug: 'robo-b' });

		const result = await updateRobot(env, 'robo-a', validForm({ slug: 'robo-b' }));

		expect(result).toEqual({ ok: false, errors: { slug: 'slug-taken' } });
		expect(await getRobotForAdmin(env, 'robo-a')).not.toBeNull();
	});

	it('refuses to rename once a purchase references the slug, but saves everything else', async () => {
		await seedRobot({ slug: 'robo-a', status: 'available', offers: { one_time: 99700 } });
		await seedPurchase('robo-a', 99700);

		expect(await isSlugLocked(env, 'robo-a')).toBe(true);
		const renamed = await updateRobot(env, 'robo-a', validForm({ slug: 'robo-b', status: 'available' }));
		expect(renamed).toEqual({ ok: false, errors: { slug: 'slug-locked' } });
		expect(await getRobotForAdmin(env, 'robo-b')).toBeNull();
		expect((await getRobotForAdmin(env, 'robo-a'))?.offers).toEqual([{ offer: 'one_time', priceCents: 99700 }]);

		const kept = await updateRobot(env, 'robo-a', validForm({ slug: 'robo-a', name: 'Renomeado', status: 'available' }));
		expect(kept).toEqual({ ok: true, slug: 'robo-a' });
		expect((await getRobotForAdmin(env, 'robo-a'))?.name).toBe('Renomeado');
	});

	it('changes the checkout price but never an existing purchase amount', async () => {
		await seedRobot({ slug: 'robo-a', status: 'available', offers: { one_time: 99700 } });
		await seedPurchase('robo-a', 99700);

		await updateRobot(env, 'robo-a', validForm({ slug: 'robo-a', status: 'available', prices: { one_time: '1.299,00', annual: '' } }));

		expect(await lookupOffer(env, 'robo-a', 'one_time')).toEqual({ kind: 'found', amountCents: 129900 });
		const purchase = await env.DB.prepare("SELECT amount_cents FROM purchases WHERE id = 'purchase-robo-a'").first();
		expect(purchase).toEqual({ amount_cents: 99700 });
	});
});

describe('setRobotStatus', () => {
	it('publishes, unpublishes and archives, and the public catalog follows', async () => {
		await createRobot(env, validForm({ prices: { one_time: '997,00', annual: '' } }));
		expect(await listPublishedWithOffers(env)).toEqual([]);

		expect(await setRobotStatus(env, 'robo-novo', 'available')).toEqual({ ok: true });
		expect((await listPublishedWithOffers(env)).map((r) => r.slug)).toEqual(['robo-novo']);
		expect(await lookupOffer(env, 'robo-novo', 'one_time')).toEqual({ kind: 'found', amountCents: 99700 });

		expect(await setRobotStatus(env, 'robo-novo', 'draft')).toEqual({ ok: true });
		expect(await listPublishedWithOffers(env)).toEqual([]);

		expect(await setRobotStatus(env, 'robo-novo', 'coming-soon')).toEqual({ ok: true });
		expect((await listPublishedWithOffers(env)).map((r) => [r.slug, r.offers])).toEqual([['robo-novo', []]]);

		expect(await setRobotStatus(env, 'robo-novo', 'archived')).toEqual({ ok: true });
		expect(await listPublishedWithOffers(env)).toEqual([]);
	});

	it('archives instead of deleting, reversibly, and keeps the row and its Ofertas', async () => {
		await seedRobot({ slug: 'robo-a', status: 'available', offers: { one_time: 99700 } });

		await setRobotStatus(env, 'robo-a', 'archived');
		expect(await getRobotForAdmin(env, 'robo-a')).toMatchObject({ status: 'archived', offers: [{ offer: 'one_time', priceCents: 99700 }] });

		await setRobotStatus(env, 'robo-a', 'available');
		expect((await listPublishedWithOffers(env)).map((r) => r.slug)).toEqual(['robo-a']);
	});

	it('refuses to make a Robô without an Oferta available', async () => {
		await seedRobot({ slug: 'robo-a', status: 'draft' });

		expect(await setRobotStatus(env, 'robo-a', 'available')).toEqual({ ok: false, error: 'offers-required' });
		expect((await getRobotForAdmin(env, 'robo-a'))?.status).toBe('draft');
	});

	it('rejects an unknown status and an unknown slug', async () => {
		await seedRobot({ slug: 'robo-a' });

		expect(await setRobotStatus(env, 'robo-a', 'deleted')).toEqual({ ok: false, error: 'invalid-status' });
		expect(await setRobotStatus(env, 'nope', 'draft')).toEqual({ ok: false, error: 'not-found' });
	});
});

describe('admin reads and draft preview', () => {
	it('lists every status, ordered by sort_order then slug', async () => {
		await seedRobot({ slug: 'b', status: 'draft', sortOrder: 2 });
		await seedRobot({ slug: 'a', status: 'archived', sortOrder: 2 });
		await seedRobot({ slug: 'c', status: 'available', sortOrder: 1, offers: { annual: 100 } });

		const all = await listAllRobots(env);

		expect(all.map((r) => [r.slug, r.status])).toEqual([
			['c', 'available'],
			['a', 'archived'],
			['b', 'draft'],
		]);
		expect(all[0].offers).toEqual([{ offer: 'annual', priceCents: 100 }]);
	});

	it('shows a draft on the catalog only when drafts are asked for, with its Ofertas', async () => {
		await seedRobot({ slug: 'pub', status: 'available', offers: { one_time: 100 } });
		await seedRobot({ slug: 'dra', status: 'draft', offers: { one_time: 200 } });
		await seedRobot({ slug: 'arc', status: 'archived', offers: { one_time: 300 } });

		expect((await listPublishedWithOffers(env)).map((r) => r.slug)).toEqual(['pub']);
		const preview = await listPublishedWithOffers(env, { includeDrafts: true });
		expect(preview.map((r) => [r.slug, r.status, r.offers.length])).toEqual([
			['dra', 'draft', 1],
			['pub', 'available', 1],
		]);
		expect(await lookupOffer(env, 'dra', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});

	it('round-trips a stored Robô through the edit form', async () => {
		await seedRobot({
			slug: 'robo-a',
			market: ['Mini Índice'],
			perfil: 'Moderado',
			supportedCorretoras: ['X', 'Y'],
			sortOrder: 7,
			offers: { one_time: 99700, annual: 4950 },
		});

		const form = toFormInput((await getRobotForAdmin(env, 'robo-a'))!);

		expect(form).toMatchObject({
			slug: 'robo-a',
			market: 'Mini Índice',
			perfil: 'Moderado',
			supportedCorretoras: 'X, Y',
			sortOrder: '7',
			prices: { one_time: '997,00', annual: '49,50' },
		});
		expect(validateRobotForm(form)).toMatchObject({ ok: true });
	});

	it('reads the posted form fields, tolerating missing ones', () => {
		const form = new FormData();
		form.set('name', 'N');
		form.set('price_one_time', '10');

		expect(readRobotForm(form)).toMatchObject({ name: 'N', slug: '', status: 'draft', prices: { one_time: '10', annual: '' } });
	});
});
