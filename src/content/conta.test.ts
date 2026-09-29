import { describe, expect, it } from 'vitest';
import { LIFETIME_EXPIRY } from '../modules/licensing/license-expiry';
import { licenseActiveText, licenseStatusText } from './conta';

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
