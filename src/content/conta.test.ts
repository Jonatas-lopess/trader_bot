import { describe, expect, it } from 'vitest';
import { LIFETIME_EXPIRY } from '../modules/licensing/license-expiry';
import { formatPurchaseDate, licenseActiveText, licenseStatusText } from './conta';

describe('licenseActiveText', () => {
	it('shows a dated term as "Ativa até DD/MM"', () => {
		expect(licenseActiveText('2027-03-15T12:00:00.000Z')).toBe('Ativa até 15/03');
	});

	it('shows the lifetime sentinel as "Vitalícia"', () => {
		expect(licenseActiveText(LIFETIME_EXPIRY)).toBe('Vitalícia');
	});
});

describe('licenseStatusText', () => {
	it('has one line per Licença state', () => {
		expect(licenseStatusText({ status: 'none' })).toBe('Aguardando confirmação do pagamento');
		expect(licenseStatusText({ status: 'awaiting_account' })).toBe('Aguardando o número da sua conta');
		expect(licenseStatusText({ status: 'preparing' })).toBe('Sendo preparada');
		expect(licenseStatusText({ status: 'active', expiresAt: LIFETIME_EXPIRY })).toBe('Vitalícia');
		expect(licenseStatusText({ status: 'expired', expiresAt: '2026-09-01T00:00:00.000Z' })).toBe('Expirada em 01/09');
		expect(licenseStatusText({ status: 'revoked' })).toBe('Revogada');
	});
});

describe('formatPurchaseDate', () => {
	it('shows the day in Brasília time as DD/MM/AAAA', () => {
		expect(formatPurchaseDate('2026-10-01T15:00:00.000Z')).toBe('01/10/2026');
		// 02:30 UTC is still the previous evening in Brasília.
		expect(formatPurchaseDate('2026-10-12T02:30:00.000Z')).toBe('11/10/2026');
	});
});
