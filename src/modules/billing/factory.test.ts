import { describe, expect, it } from 'vitest';
import { selectProvider } from './factory';

describe('selectProvider', () => {
	it('defaults to Appmax when PAYMENT_PROVIDER is unset', () => {
		expect(selectProvider({ PAYMENT_PROVIDER: undefined }).id).toBe('appmax');
	});

	it('fails closed to Appmax on an unrecognised value', () => {
		// @ts-expect-error deliberately invalid input — the fail-closed
		// behaviour this test checks must hold even for garbage, not just
		// `undefined` (docs/adr/0005-stripe-test-driver.md).
		expect(selectProvider({ PAYMENT_PROVIDER: 'pagseguro' }).id).toBe('appmax');
	});

	it('selects Stripe only on the exact literal "stripe"', () => {
		expect(selectProvider({ PAYMENT_PROVIDER: 'stripe' }).id).toBe('stripe');
	});
});
