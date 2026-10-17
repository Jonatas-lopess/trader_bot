import { describe, expect, it } from 'vitest';
import type { CartSummary, PricedCartLine } from '../modules/catalog/price-cart';
import { cartCheckoutHref } from './cart-limits';
import { isCartSummary, lineView, summaryView } from './cart-view-model';

const priced = (over: Partial<PricedCartLine> = {}): PricedCartLine => ({
	robot: 'robo-a',
	offer: 'one_time',
	quantity: 1,
	name: 'Robô A',
	unitCents: 99_700,
	lineCents: 99_700,
	available: true,
	...over,
});

describe('lineView', () => {
	it('shows the name, the Oferta and the server price of a line', () => {
		const view = lineView(priced());
		expect(view.label).toBe('Robô A');
		expect(view.offer).toBe('Licença Perpétua');
		expect(view.quantity).toBe('1');
		expect(view.price).toEqual({ line: 'R$ 997', unit: '' });
		expect(view.decreaseDisabled).toBe(true);
		expect(view.increaseDisabled).toBe(false);
	});

	it('adds the unit price once the quantity passes one, and caps the stepper', () => {
		const view = lineView(priced({ quantity: 5, lineCents: 498_500 }));
		expect(view.price).toEqual({ line: 'R$ 4.985', unit: 'R$ 997 cada' });
		expect(view.decreaseDisabled).toBe(false);
		expect(view.increaseDisabled).toBe(true);
	});

	it('names the Robô in every control, falling back to the slug', () => {
		const view = lineView(priced({ name: null }));
		expect(view.label).toBe('robo-a');
		expect(view.decreaseAria).toContain('robo-a');
		expect(view.increaseAria).toContain('robo-a');
		expect(view.removeAria).toContain('robo-a');
	});

	it('gives an unavailable line no price', () => {
		const view = lineView(priced({ available: false, unitCents: null, lineCents: null }));
		expect(view.price).toBeNull();
		expect(view.unavailable).toBe('Indisponível no momento');
	});
});

describe('summaryView', () => {
	const lines = [{ robot: 'robo-a', offer: 'one_time' as const, quantity: 2 }];

	it('totals from the server and links checkout to the store lines', () => {
		const summary: CartSummary = { lines: [priced({ quantity: 2, lineCents: 199_400 })], totalCents: 199_400 };
		expect(summaryView(summary, lines)).toEqual({
			total: 'R$ 1.994',
			note: null,
			checkoutHref: cartCheckoutHref(lines),
		});
	});

	it('disables checkout and explains why while a line is unavailable', () => {
		const summary: CartSummary = {
			lines: [priced(), priced({ robot: 'robo-b', available: false, unitCents: null, lineCents: null })],
			totalCents: 99_700,
		};
		const view = summaryView(summary, lines);
		expect(view.checkoutHref).toBeNull();
		expect(view.note).toMatch(/Remova/);
	});
});

describe('isCartSummary', () => {
	it('accepts the endpoint shape and rejects anything else', () => {
		expect(isCartSummary({ lines: [], totalCents: 0 })).toBe(true);
		expect(isCartSummary(null)).toBe(false);
		expect(isCartSummary({ lines: [] })).toBe(false);
		expect(isCartSummary({ lines: 'x', totalCents: 1 })).toBe(false);
	});
});
