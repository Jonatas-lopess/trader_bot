import { describe, expect, it } from 'vitest';
import { cartBadgeText, cartLabelFor, cartLink } from './header';

describe('cart icon labels', () => {
	it('links to the cart page', () => {
		expect(cartLink.href).toBe('/carrinho');
	});

	it('names the cart, with a count only when it holds something', () => {
		expect(cartLabelFor(0)).toBe('Carrinho');
		expect(cartLabelFor(1)).toBe('Carrinho, 1 item');
		expect(cartLabelFor(3)).toBe('Carrinho, 3 itens');
	});

	it('caps the badge so it never outgrows its circle', () => {
		expect(cartBadgeText(7)).toBe('7');
		expect(cartBadgeText(99)).toBe('99');
		expect(cartBadgeText(100)).toBe('99+');
	});
});
