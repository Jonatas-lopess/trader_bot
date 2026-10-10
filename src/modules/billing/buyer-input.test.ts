import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../identity/normalize-email';
import { isValidCnpj, isValidCpf, normalizeBuyerInput } from './buyer-input';

const VALID = { name: 'Maria Silva', email: 'maria@example.com', phone: '(11) 91234-5678', document: '529.982.247-25' };

describe('isValidCpf', () => {
	it.each(['52998224725', '11144477735', '12345678909'])('accepts %s', (cpf) => {
		expect(isValidCpf(cpf)).toBe(true);
	});

	it.each(['11111111111', '00000000000', '52998224726', '5299822472', '529982247250', ''])('rejects %s', (cpf) => {
		expect(isValidCpf(cpf)).toBe(false);
	});
});

describe('isValidCnpj', () => {
	it.each(['11222333000181', '11444777000161'])('accepts %s', (cnpj) => {
		expect(isValidCnpj(cnpj)).toBe(true);
	});

	it.each(['11111111111111', '11222333000182', '1122233300018', '112223330001811', ''])('rejects %s', (cnpj) => {
		expect(isValidCnpj(cnpj)).toBe(false);
	});
});

describe('normalizeBuyerInput', () => {
	it('returns the normalized buyer for valid input', () => {
		expect(normalizeBuyerInput(VALID)).toEqual({
			ok: true,
			buyer: {
				firstName: 'Maria',
				lastName: 'Silva',
				email: 'maria@example.com',
				phone: '11912345678',
				document: '52998224725',
			},
		});
	});

	it('accepts a valid CNPJ', () => {
		const result = normalizeBuyerInput({ ...VALID, document: '11.222.333/0001-81' });
		expect(result).toMatchObject({ ok: true, buyer: { document: '11222333000181' } });
	});

	describe('name', () => {
		it.each([
			['Maria Silva', 'Maria', 'Silva'],
			['Maria de Souza Silva', 'Maria', 'de Souza Silva'],
			['  Maria    Silva  ', 'Maria', 'Silva'],
			['Maria\tde  Souza', 'Maria', 'de Souza'],
		])('splits %j', (name, firstName, lastName) => {
			expect(normalizeBuyerInput({ ...VALID, name })).toMatchObject({ ok: true, buyer: { firstName, lastName } });
		});

		it.each(['Maria', '   Maria  ', '', '   ', undefined, 42])('rejects %j', (name) => {
			expect(normalizeBuyerInput({ ...VALID, name })).toEqual({ ok: false, fieldErrors: { name: 'name_invalid' } });
		});
	});

	describe('email', () => {
		it.each(['Maria@Example.COM', '  maria@example.com '])('normalizes %j like modules/identity', (email) => {
			const expected = normalizeEmail(email);
			expect(expected).not.toBeNull();
			expect(normalizeBuyerInput({ ...VALID, email })).toMatchObject({ ok: true, buyer: { email: expected } });
		});

		it.each(['', 'maria', 'maria@', '@example.com', 'maria@example', 'maria@exa mple.com', 'ma ria@example.com', 'maria@.com', 'maria@example.', 'aná@example.com', undefined])(
			'rejects %j',
			(email) => {
				expect(normalizeBuyerInput({ ...VALID, email })).toEqual({ ok: false, fieldErrors: { email: 'email_invalid' } });
			}
		);
	});

	describe('phone', () => {
		it.each([
			['(11) 91234-5678', '11912345678'],
			['11912345678', '11912345678'],
			['+55 11 91234-5678', '11912345678'],
			['5511912345678', '11912345678'],
			['(11) 3123-4567', '1131234567'],
			['+55 (21) 3123-4567', '2131234567'],
		])('accepts %j', (phone, expected) => {
			expect(normalizeBuyerInput({ ...VALID, phone })).toMatchObject({ ok: true, buyer: { phone: expected } });
		});

		it.each(['', '123', '(11) 1234-567', '119123456789', '+55 11 9123-45678 9', '0112345678', 'abc', undefined])('rejects %j', (phone) => {
			expect(normalizeBuyerInput({ ...VALID, phone })).toEqual({ ok: false, fieldErrors: { phone: 'phone_invalid' } });
		});
	});

	describe('document', () => {
		it.each([
			['', 'document_invalid'],
			['111.111.111-11', 'document_invalid'],
			['529.982.247-26', 'document_invalid'],
			['5299822472', 'document_invalid'],
			['11.222.333/0001-82', 'document_invalid'],
			['12.ABC.345/01DE-35', 'document_alphanumeric'],
			['12ABC34501DE35', 'document_alphanumeric'],
			['abc', 'document_invalid'],
			['123.456.789-0x', 'document_invalid'],
			[undefined, 'document_invalid'],
		])('rejects %j with %s', (document, code) => {
			expect(normalizeBuyerInput({ ...VALID, document })).toEqual({ ok: false, fieldErrors: { document: code } });
		});
	});

	it('returns every field error at once', () => {
		expect(normalizeBuyerInput({ name: 'Maria', email: 'x', phone: '1', document: '1' })).toEqual({
			ok: false,
			fieldErrors: { name: 'name_invalid', email: 'email_invalid', phone: 'phone_invalid', document: 'document_invalid' },
		});
	});

	it('handles a non-object input without throwing', () => {
		for (const raw of [null, undefined, 'x', 42]) {
			expect(normalizeBuyerInput(raw)).toMatchObject({ ok: false, fieldErrors: { name: 'name_invalid' } });
		}
	});

	it('never puts personal data in the error result', () => {
		const result = normalizeBuyerInput({ name: 'Zelda', email: 'zelda@secret.test x', phone: '9999', document: '123456' });
		expect(JSON.stringify(result)).not.toMatch(/zelda|secret|9999|123456/i);
	});
});
