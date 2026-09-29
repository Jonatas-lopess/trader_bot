import { describe, expect, it } from 'vitest';
import { LIFETIME_EXPIRY } from '../modules/licensing/license-expiry';
import { licenseActiveText } from './conta';

describe('licenseActiveText', () => {
	it('shows a dated term as "Ativa até DD/MM"', () => {
		expect(licenseActiveText('2027-03-15T12:00:00.000Z')).toBe('Ativa até 15/03');
	});

	it('shows the lifetime sentinel as "Vitalícia"', () => {
		expect(licenseActiveText(LIFETIME_EXPIRY)).toBe('Vitalícia');
	});
});
