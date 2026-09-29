import { describe, expect, it } from 'vitest';
import { catalog, lookupOffer } from './catalog';

describe('lookupOffer', () => {
	it('returns the amount for every offered robot/offer pair', () => {
		for (const robot of catalog) {
			for (const [offer, price] of Object.entries(robot.offers)) {
				expect(lookupOffer(robot.slug, offer)).toEqual({
					kind: 'found',
					amountCents: price.value,
				});
			}
		}
	});

	it('reports an unknown robot', () => {
		expect(lookupOffer('no-such-robot', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});

	it('reports an unknown offer name', () => {
		expect(lookupOffer(catalog[0].slug, 'weekly')).toEqual({ kind: 'unknown_offer' });
	});

	it('reports an offer that exists but is not offered for that robot', () => {
		const robot = catalog.find((r) => !('monthly' in r.offers));
		expect(robot).toBeDefined();
		expect(lookupOffer(robot!.slug, 'monthly')).toEqual({ kind: 'unknown_offer' });
	});

	it('does not resolve inherited object keys as offers or robots', () => {
		expect(lookupOffer(catalog[0].slug, 'toString')).toEqual({ kind: 'unknown_offer' });
		expect(lookupOffer('constructor', 'one_time')).toEqual({ kind: 'unknown_robot' });
	});
});

describe('catalog placeholders', () => {
	it('every price is a positive integer number of cents, launch-blocked', () => {
		for (const robot of catalog) {
			for (const price of Object.values(robot.offers)) {
				expect(price.blocked).toBe(true);
				expect(Number.isInteger(price.value)).toBe(true);
				expect(price.value).toBeGreaterThan(0);
			}
		}
	});

	it('slugs are unique', () => {
		const slugs = catalog.map((r) => r.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});
});
