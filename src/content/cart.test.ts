import { describe, expect, it } from 'vitest';
import {
	checkoutLabel,
	unavailableNote,
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

	it('explains why "Finalizar compra" is disabled while a line is unavailable', () => {
		expect(checkoutLabel).toBe('Finalizar compra');
		expect(unavailableNote).toMatch(/continuar/);
	});

	it('names the three payment methods, is launch-blocked, and steers Anual to Pix', () => {
		expect(paymentMethodsNote.blocked).toBe(true);
		expect(paymentMethodsNote.value).toMatch(/cartão/);
		expect(paymentMethodsNote.value).toMatch(/Boleto/);
		expect(paymentMethodsNote.value).toMatch(/Pix/);
		expect(paymentMethodsNote.value).toMatch(/Anual/);
	});
});
