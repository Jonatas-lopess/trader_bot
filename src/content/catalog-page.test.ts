import { describe, expect, it } from 'vitest';
import { catalog, lookupOffer } from './catalog';
import { catalogCards, checkoutHref, formatBrl, offerOrder } from './catalog-page';

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
