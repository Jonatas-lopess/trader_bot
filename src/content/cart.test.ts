import { describe, expect, it } from 'vitest';
import {
	checkoutLabel,
	checkoutPendingNote,
	decreaseLabel,
	increaseLabel,
	paymentMethodsNote,
	removeLabelFor,
} from './cart';

describe('cart page copy', () => {
	it('names the Robô in every per-line control, so a screen reader can tell the lines apart', () => {
		expect(decreaseLabel('Robô A')).toContain('Robô A');
		expect(increaseLabel('Robô A')).toContain('Robô A');
		expect(removeLabelFor('Robô A')).toContain('Robô A');
	});

	it('explains why "Finalizar compra" is disabled (checkout for N lines is ticket 11)', () => {
		expect(checkoutLabel).toBe('Finalizar compra');
		expect(checkoutPendingNote.trim()).not.toBe('');
	});

	it('names the three payment methods, is launch-blocked, and steers Anual to Pix', () => {
		expect(paymentMethodsNote.blocked).toBe(true);
		expect(paymentMethodsNote.value).toMatch(/cartão/);
		expect(paymentMethodsNote.value).toMatch(/Boleto/);
		expect(paymentMethodsNote.value).toMatch(/Pix/);
		expect(paymentMethodsNote.value).toMatch(/Anual/);
	});
});
