import { describe, expect, it } from 'vitest';
import { catalog, lookupOffer } from './catalog';
import {
	buyWithdrawalNote,
	cardBuy,
	cardInfoRows,
	cardPriceRows,
	cardWithdrawalNote,
	catalogCards,
	checkoutHref,
	defaultOffer,
	formatBrl,
	offerOrder,
} from './catalog-page';
import { withdrawalHref } from './legal';

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

describe('catalogCards', () => {
	it('has one card per catalog robot', () => {
		expect(catalogCards.map((c) => c.slug)).toEqual(catalog.map((r) => r.slug));
	});

	it('every buy link resolves through lookupOffer, at the catalog price', () => {
		for (const card of catalogCards) {
			for (const offer of card.offers) {
				const params = new URL(offer.href, 'https://example.com').searchParams;
				expect(lookupOffer(params.get('robot')!, params.get('offer')!)).toEqual({
					kind: 'found',
					amountCents: offer.amountCents,
				});
			}
		}
	});

	it('lists offers in Compra, Anual, Mensal order', () => {
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
	const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;

	it('labels the rows Licença Perpétua, Anual and Mensal, in that order', () => {
		expect(bySlug('robo-exemplo-a').offers.map((o) => o.label)).toEqual(['Licença Perpétua', 'Anual', 'Mensal']);
	});

	it('shows only the Ofertas the Robô sells', () => {
		expect(bySlug('robo-exemplo-b').offers.map((o) => o.label)).toEqual(['Licença Perpétua']);
		expect(bySlug('robo-exemplo-d').offers.map((o) => o.label)).toEqual(['Licença Perpétua', 'Mensal']);
	});

	it('carries no caption under the price', () => {
		for (const card of catalogCards) for (const offer of card.offers) expect(offer).not.toHaveProperty('caption');
	});
});

describe('default selection', () => {
	const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;
	const withoutCompra = (slug: string) => ({
		...bySlug(slug),
		offers: bySlug(slug).offers.filter((o) => o.offer !== 'one_time'),
	});

	it('is Compra (Licença Perpétua) when the Robô sells it', () => {
		for (const slug of ['robo-exemplo-a', 'robo-exemplo-b', 'robo-exemplo-d']) {
			expect(defaultOffer(bySlug(slug))?.offer).toBe('one_time');
		}
	});

	it('is the first row when the Robô has no Compra', () => {
		expect(defaultOffer(withoutCompra('robo-exemplo-a'))?.offer).toBe('annual');
		expect(defaultOffer(withoutCompra('robo-exemplo-d'))?.offer).toBe('monthly');
	});

	it('is nothing on a coming-soon Robô', () => {
		for (const card of catalogCards.filter((c) => c.status === 'coming-soon')) {
			expect(defaultOffer(card)).toBeNull();
			expect(cardPriceRows(card)).toEqual([]);
		}
	});
});

describe('selectable price rows', () => {
	const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;

	it('keeps the card order and marks exactly the default row selected', () => {
		const rows = cardPriceRows(bySlug('robo-exemplo-a'));
		expect(rows.map((r) => [r.offer, r.selected])).toEqual([
			['one_time', true],
			['annual', false],
			['monthly', false],
		]);
	});

	it('selects the first row when there is no Compra', () => {
		const card = { ...bySlug('robo-exemplo-d'), offers: bySlug('robo-exemplo-d').offers.slice(1) };
		expect(cardPriceRows(card).map((r) => r.selected)).toEqual([true]);
	});

	it('gives every row its own checkout href with only robot and offer (ADR-0006)', () => {
		for (const card of catalogCards) {
			for (const row of cardPriceRows(card)) {
				expect(row.href).toBe(checkoutHref(card.slug, row.offer));
				const params = new URL(row.href, 'https://example.com').searchParams;
				expect([...params.keys()]).toEqual(['robot', 'offer']);
				expect(lookupOffer(params.get('robot')!, params.get('offer')!)).toEqual({
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

describe('buy button', () => {
	const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;

	it('reads "Comprar <Robô name>" and buys Compra by default', () => {
		const card = bySlug('robo-exemplo-a');
		expect(cardBuy(card)).toEqual({
			label: 'Comprar Robô Exemplo A',
			href: '/checkout?robot=robo-exemplo-a&offer=one_time',
		});
	});

	it('falls back to the first Oferta the Robô sells when it has no Compra', () => {
		const card = { ...bySlug('robo-exemplo-d'), offers: bySlug('robo-exemplo-d').offers.filter((o) => o.offer !== 'one_time') };
		expect(cardBuy(card)?.href).toBe('/checkout?robot=robo-exemplo-d&offer=monthly');
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
	const bySlug = (slug: string) => catalogCards.find((c) => c.slug === slug)!;

	it('shows Estratégia, Mercado and Perfil, in that order, on a Robô that fills them', () => {
		const card = { ...bySlug('robo-exemplo-a'), perfil: 'Conservador / Médio Prazo' };
		expect(card.market.length).toBeGreaterThan(0);
		const rows = cardInfoRows(card);
		expect(rows.map((r) => r.label)).toEqual(['Estratégia', 'Mercado', 'Perfil']);
		expect(rows[2]?.value).toBe('Conservador / Médio Prazo');
	});

	it('omits Perfil when the Robô declares none (no placeholder Robô does yet)', () => {
		for (const card of catalogCards) expect(card.perfil).toBeNull();
		expect(cardInfoRows(bySlug('robo-exemplo-a')).map((r) => r.label)).toEqual(['Estratégia', 'Mercado']);
	});

	it('omits Mercado and Perfil when the Robô has neither', () => {
		const card = bySlug('robo-exemplo-c');
		expect(card.market).toEqual([]);
		expect(card.perfil).toBeNull();
		expect(cardInfoRows(card).map((r) => r.label)).toEqual(['Estratégia']);
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
		const card = { ...bySlug('robo-exemplo-a'), market: ['Mini Índice', 'Mini Dólar'] };
		expect(cardInfoRows(card).find((r) => r.label === 'Mercado')?.value).toBe('Mini Índice, Mini Dólar');
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
