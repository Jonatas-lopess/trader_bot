import { describe, expect, it } from 'vitest';
import { CART_OFFERS } from '../shared/cart-limits';
import { buyWithdrawalNote } from './catalog-page';
import {
	buyerFields,
	cardAnalysisNote,
	checkoutOfferLabels,
	fieldErrors,
	methods,
	payErrors,
	securityNote,
	unavailable,
	withdrawalNote,
} from './checkout-form';

describe('checkout form copy', () => {
	it('labels every buyer field of buyer-input.ts', () => {
		expect(Object.keys(buyerFields).sort()).toEqual(['document', 'email', 'name', 'phone']);
		for (const field of Object.values(buyerFields)) expect(field.label).not.toBe('');
	});

	it('has copy for every field-error code of buyer-input.ts', () => {
		expect(Object.keys(fieldErrors).sort()).toEqual([
			'document_alphanumeric',
			'document_invalid',
			'email_invalid',
			'name_invalid',
			'phone_invalid',
		]);
		for (const message of Object.values(fieldErrors)) expect(message).not.toBe('');
	});

	it('points an alphanumeric CNPJ to support', () => {
		expect(fieldErrors.document_alphanumeric).toMatch(/@/);
	});

	it('has copy for every pay failure the page can show', () => {
		for (const code of [
			'card_declined',
			'provider_unavailable',
			'rate_limited',
			'invalid_request',
			'unknown_offer',
			'offer_not_supported',
			'method_not_allowed',
			'token_required',
			'tokenization_failed',
			'network',
		] as const) {
			expect(payErrors[code]).toBeTruthy();
		}
	});

	it('labels every Oferta the checkout sells', () => {
		for (const offer of CART_OFFERS) expect(checkoutOfferLabels[offer]).toBeTruthy();
	});

	it('labels and explains every payment method; Boleto says up to one business day', () => {
		for (const method of ['card', 'pix', 'boleto'] as const) {
			expect(methods[method].label).not.toBe('');
			expect(methods[method].note).not.toBe('');
		}
		expect(methods.boleto.note).toMatch(/1 dia útil/);
	});

	it('launch-blocks the unverified claims: security reassurance, card approval time, withdrawal note', () => {
		expect(securityNote.blocked).toBe(true);
		expect(securityNote.reason).toMatch(/ADR-0007/);
		expect(cardAnalysisNote.blocked).toBe(true);
		expect(methods.card.note).toBe(cardAnalysisNote.value);
		expect(withdrawalNote).toBe(buyWithdrawalNote);
		expect(withdrawalNote.text.blocked).toBe(true);
		expect(withdrawalNote.text.value).not.toMatch(/garantia/i);
	});

	it('the unavailable state links back to the catalog', () => {
		expect(unavailable.backLink.href).toBe('/catalog');
	});
});
