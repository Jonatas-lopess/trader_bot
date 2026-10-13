import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { listPublishedWithOffers, lookupOffer } from '../modules/catalog/robots';
import { clearCatalog, seedRobot } from '../modules/catalog/test-helpers';
import {
	buildCatalogCards,
	buyWithdrawalNote,
	cardBuy,
	cardInfoRows,
	cardMainPrice,
	cardPriceRows,
	cardWithdrawalNote,
	checkoutHref,
	defaultOffer,
	draftLabel,
	emptyCatalogMessage,
	formatBrl,
	learnMoreLabelFor,
	offerOrder,
	type CatalogCard,
} from './catalog-page';
import { withdrawalHref } from './legal';

// The cards the page builds from a seeded D1 catalog: A sells Compra + Anual, B only Compra,
// C and E are coming soon, D is a draft the page must never show, F is archived.
let catalogCards: CatalogCard[];
const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;

beforeEach(async () => {
	await clearCatalog();
	await seedRobot({
		slug: 'robo-exemplo-a',
		name: 'Robô Exemplo A',
		market: ['Mini Índice', 'Mini Dólar'],
		sortOrder: 10,
		offers: { annual: 49700, one_time: 99700 },
	});
	await seedRobot({ slug: 'robo-exemplo-b', name: 'Robô Exemplo B', market: ['Mini Índice'], sortOrder: 20, offers: { one_time: 149700 } });
	await seedRobot({ slug: 'robo-exemplo-c', status: 'coming-soon', market: null, sortOrder: 30 });
	await seedRobot({ slug: 'robo-exemplo-d', status: 'draft', sortOrder: 40, offers: { one_time: 119700 } });
	await seedRobot({ slug: 'robo-exemplo-e', status: 'coming-soon', perfil: 'Conservador / Médio Prazo', sortOrder: 50 });
	await seedRobot({ slug: 'robo-exemplo-f', status: 'archived', sortOrder: 60, offers: { one_time: 1 } });
	catalogCards = buildCatalogCards(await listPublishedWithOffers(env));
});

describe('formatBrl', () => {
	it('formats integer cents as BRL', () => {
		expect(formatBrl(99700)).toBe('R$ 997');
		expect(formatBrl(9750)).toBe('R$ 97,50');
	});
});

describe('checkoutHref', () => {
	it('carries only robot and offer, never a price', () => {
		const href = checkoutHref('robo-exemplo-a', 'one_time');
		expect(href).toBe('/checkout?robot=robo-exemplo-a&offer=one_time');
		expect(href).not.toMatch(/price|amount|plan/i);
	});
});

describe('emptyCatalogMessage', () => {
	it('is real copy for the page to show when no card is built', () => {
		expect(buildCatalogCards([])).toEqual([]);
		expect(emptyCatalogMessage.trim()).not.toBe('');
	});
});

describe('draft preview (admin)', () => {
	it('marks a draft card, with its Ofertas, only when drafts were loaded', async () => {
		expect(catalogCards.some((c) => c.draft)).toBe(false);

		const preview = buildCatalogCards(await listPublishedWithOffers(env, { includeDrafts: true }));

		expect(preview.filter((c) => c.draft).map((c) => [c.slug, c.offers.map((o) => o.priceText)])).toEqual([
			['robo-exemplo-d', ['R$ 1.197']],
		]);
		expect(preview.find((c) => c.slug === 'robo-exemplo-f')).toBeUndefined();
		expect(draftLabel.trim()).not.toBe('');
	});
});

describe('buildCatalogCards', () => {
	it('has one card per published Robô, in listing order, and none for a draft or archived one', () => {
		expect(catalogCards.map((c) => c.slug)).toEqual([
			'robo-exemplo-a',
			'robo-exemplo-b',
			'robo-exemplo-c',
			'robo-exemplo-e',
		]);
	});

	it('carries the long description for the "Saiba mais" modal, untouched', () => {
		expect(bySlug('robo-exemplo-a').longDescription).toBe('Descrição longa de robo-exemplo-a.');
		const markup = '<img src=x onerror=alert(1)> & "quotes"';
		const [card] = buildCatalogCards([
			{
				slug: 'x',
				name: 'X',
				shortDescription: 's',
				longDescription: markup,
				strategyType: 't',
				market: null,
				perfil: null,
				supportedCorretoras: null,
				status: 'available',
				sortOrder: 0,
				offers: [],
			},
		]);
		// Escaping is the template's job (Astro text nodes); the content layer must not pre-encode it.
		expect(card?.longDescription).toBe(markup);
	});

	it('copies the Robô facts from the row', () => {
		expect(bySlug('robo-exemplo-a')).toMatchObject({
			name: 'Robô Exemplo A',
			shortDescription: 'Descrição curta de robo-exemplo-a.',
			strategyType: 'Tendência',
			market: ['Mini Índice', 'Mini Dólar'],
			perfil: null,
			status: 'available',
		});
	});

	it('every buy link resolves through lookupOffer, at the D1 price', async () => {
		for (const card of catalogCards) {
			for (const offer of card.offers) {
				const params = new URL(offer.href, 'https://example.com').searchParams;
				expect(await lookupOffer(env, params.get('robot')!, params.get('offer')!)).toEqual({
					kind: 'found',
					amountCents: offer.amountCents,
				});
			}
		}
	});

	it('lists offers in Compra, Anual order', () => {
		for (const card of catalogCards) {
			const idx = card.offers.map((o) => offerOrder.indexOf(o.offer));
			expect(idx).toEqual([...idx].sort((a, b) => a - b));
		}
	});

	it('offers nothing to buy on a coming-soon robot', () => {
		const soon = catalogCards.filter((c) => c.status === 'coming-soon');
		expect(soon.length).toBeGreaterThan(0);
		for (const card of soon) expect(card.offers).toEqual([]);
	});
});

describe('price rows', () => {
	it('labels the rows Licença Perpétua and Anual, in that order, with the price text', () => {
		expect(bySlug('robo-exemplo-a').offers.map((o) => [o.label, o.priceText])).toEqual([
			['Licença Perpétua', 'R$ 997'],
			['Anual', 'R$ 497'],
		]);
	});

	it('shows only the Ofertas the Robô sells, and never Mensal (standby)', () => {
		expect(bySlug('robo-exemplo-b').offers.map((o) => o.label)).toEqual(['Licença Perpétua']);
		for (const card of catalogCards) expect(card.offers.map((o) => o.label)).not.toContain('Mensal');
	});

	it('carries no caption under the price', () => {
		for (const card of catalogCards) for (const offer of card.offers) expect(offer).not.toHaveProperty('caption');
	});
});

describe('default selection', () => {
	const withoutCompra = (slug: string) => ({
		...bySlug(slug),
		offers: bySlug(slug).offers.filter((o) => o.offer !== 'one_time'),
	});

	it('is Compra (Licença Perpétua) when the Robô sells it', () => {
		for (const slug of ['robo-exemplo-a', 'robo-exemplo-b']) {
			expect(defaultOffer(bySlug(slug))?.offer).toBe('one_time');
		}
	});

	it('is the first row when the Robô has no Compra', () => {
		expect(defaultOffer(withoutCompra('robo-exemplo-a'))?.offer).toBe('annual');
	});

	it('is nothing on a coming-soon Robô', () => {
		for (const card of catalogCards.filter((c) => c.status === 'coming-soon')) {
			expect(defaultOffer(card)).toBeNull();
			expect(cardPriceRows(card)).toEqual([]);
		}
	});
});

describe('card main price', () => {
	it('is Compra when the Robô sells it', () => {
		expect(cardMainPrice(bySlug('robo-exemplo-a'))).toMatchObject({ offer: 'one_time', label: 'Licença Perpétua', priceText: 'R$ 997' });
	});

	it('falls back to the lowest Oferta, with its label, when there is no Compra', () => {
		const card = { ...bySlug('robo-exemplo-a'), offers: bySlug('robo-exemplo-a').offers.filter((o) => o.offer !== 'one_time') };
		expect(cardMainPrice(card)).toMatchObject({ offer: 'annual', label: 'Anual', priceText: 'R$ 497' });
	});

	it('is nothing on a coming-soon Robô', () => {
		for (const card of catalogCards.filter((c) => c.status === 'coming-soon')) expect(cardMainPrice(card)).toBeNull();
	});
});

describe('selectable price rows', () => {
	it('keeps the card order and marks exactly the default row selected', () => {
		const rows = cardPriceRows(bySlug('robo-exemplo-a'));
		expect(rows.map((r) => [r.offer, r.selected])).toEqual([
			['one_time', true],
			['annual', false],
		]);
	});

	it('selects the first row when there is no Compra', () => {
		const card = { ...bySlug('robo-exemplo-a'), offers: bySlug('robo-exemplo-a').offers.slice(1) };
		expect(cardPriceRows(card).map((r) => r.selected)).toEqual([true]);
	});

	it('gives every row its own checkout href with only robot and offer (ADR-0006)', async () => {
		for (const card of catalogCards) {
			for (const row of cardPriceRows(card)) {
				expect(row.href).toBe(checkoutHref(card.slug, row.offer));
				const params = new URL(row.href, 'https://example.com').searchParams;
				expect([...params.keys()]).toEqual(['robot', 'offer']);
				expect(await lookupOffer(env, params.get('robot')!, params.get('offer')!)).toEqual({
					kind: 'found',
					amountCents: row.amountCents,
				});
			}
		}
	});

	it('has the buy button start on the selected row', () => {
		for (const card of catalogCards) {
			const selected = cardPriceRows(card).find((r) => r.selected);
			expect(cardBuy(card)?.href).toBe(selected?.href);
		}
	});
});

describe('"Saiba mais" button', () => {
	it('names the Robô so a screen-reader button list is not six identical entries', () => {
		expect(learnMoreLabelFor(bySlug('robo-exemplo-a'))).toBe('Saiba mais sobre Robô Exemplo A');
	});
});

describe('buy button', () => {
	it('reads "Comprar <Robô name>" and buys Compra by default', () => {
		const card = bySlug('robo-exemplo-a');
		expect(cardBuy(card)).toEqual({
			label: 'Comprar Robô Exemplo A',
			href: '/checkout?robot=robo-exemplo-a&offer=one_time',
		});
	});

	it('falls back to the first Oferta the Robô sells when it has no Compra', () => {
		const card = { ...bySlug('robo-exemplo-a'), offers: bySlug('robo-exemplo-a').offers.filter((o) => o.offer !== 'one_time') };
		expect(cardBuy(card)?.href).toBe('/checkout?robot=robo-exemplo-a&offer=annual');
	});

	it('is absent on a coming-soon Robô', () => {
		for (const card of catalogCards.filter((c) => c.status === 'coming-soon')) expect(cardBuy(card)).toBeNull();
	});

	it('carries only robot and offer (ADR-0006)', () => {
		for (const card of catalogCards) {
			const buy = cardBuy(card);
			if (!buy) continue;
			expect([...new URL(buy.href, 'https://example.com').searchParams.keys()]).toEqual(['robot', 'offer']);
		}
	});
});

describe('card info rows', () => {
	it('shows Estratégia, Mercado and Perfil, in that order, on a Robô that fills them', () => {
		const card = { ...bySlug('robo-exemplo-a'), perfil: 'Conservador / Médio Prazo' };
		expect(card.market.length).toBeGreaterThan(0);
		const rows = cardInfoRows(card);
		expect(rows.map((r) => r.label)).toEqual(['Estratégia', 'Mercado', 'Perfil']);
		expect(rows[2]?.value).toBe('Conservador / Médio Prazo');
	});

	it('omits Perfil when the Robô declares none', () => {
		expect(bySlug('robo-exemplo-a').perfil).toBeNull();
		expect(cardInfoRows(bySlug('robo-exemplo-a')).map((r) => r.label)).toEqual(['Estratégia', 'Mercado']);
	});

	it('omits Mercado when the Robô has none, and shows Perfil from the row when it has one', () => {
		const noMarket = bySlug('robo-exemplo-c');
		expect(noMarket.market).toEqual([]);
		expect(cardInfoRows(noMarket).map((r) => r.label)).toEqual(['Estratégia']);
		expect(cardInfoRows(bySlug('robo-exemplo-e')).map((r) => r.label)).toEqual(['Estratégia', 'Perfil']);
	});

	it('omits a row that is absent, with no placeholder value', () => {
		const card = { ...bySlug('robo-exemplo-a'), market: [], perfil: 'Agressivo / Curto Prazo' };
		const rows = cardInfoRows(card);
		expect(rows.map((r) => r.label)).toEqual(['Estratégia', 'Perfil']);
		for (const row of rows) expect(row.value).not.toMatch(/^(-|–|—|a definir)$/i);
	});

	it('never lists Corretoras compatíveis on the card', () => {
		for (const card of catalogCards) {
			expect(cardInfoRows(card).map((r) => r.label)).not.toContain('Corretoras compatíveis');
		}
	});

	it('joins list values with a comma', () => {
		expect(cardInfoRows(bySlug('robo-exemplo-a')).find((r) => r.label === 'Mercado')?.value).toBe('Mini Índice, Mini Dólar');
	});
});

describe('withdrawal note on the buy area', () => {
	it('is launch-blocked, says 7 dias para desistir da compra, never "garantia"', () => {
		expect(buyWithdrawalNote.text.blocked).toBe(true);
		expect(buyWithdrawalNote.text.reason).toMatch(/art\. 49/);
		expect(buyWithdrawalNote.text.value).toMatch(/7 dias para desistir da compra/);
		expect(buyWithdrawalNote.text.value).not.toMatch(/garantia/i);
	});

	it('links to the Termos withdrawal clause anchor', () => {
		expect(buyWithdrawalNote.href).toBe(withdrawalHref);
	});

	it('appears on every card with something to buy, never on a coming-soon card', () => {
		for (const card of catalogCards) {
			if (card.offers.length > 0) expect(cardWithdrawalNote(card)).toBe(buyWithdrawalNote);
			else expect(cardWithdrawalNote(card)).toBeNull();
		}
		expect(catalogCards.some((c) => cardWithdrawalNote(c) !== null)).toBe(true);
	});
});
