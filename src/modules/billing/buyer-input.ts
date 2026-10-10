/**
 * Buyer input for the own Appmax checkout (docs/adr/0007, .scratch/appmax-checkout/issues/03):
 * normalization and validation shared by the checkout page script and the pay endpoint, so
 * client and server agree. Pure, no I/O.
 *
 * Errors are stable codes only (`FieldErrorCode`); user-facing copy lives in
 * `src/content/checkout-form.ts`. Neither errors nor results echo the input back: it is
 * personal data and must never reach a log or a Sentry message.
 *
 * Phone format (DDD + 8/9 digits, digits only) and the exact customer fields Appmax
 * requires are unverified against the sandbox (PLANNING.md §13).
 */

import { normalizeEmail } from '../identity/normalize-email';
import { normalizeBuyerDocument } from './payment-provider';

export type BuyerInput = {
	firstName: string;
	lastName: string;
	email: string;
	/** Digits only, DDD + 8 or 9 digits, no country code. */
	phone: string;
	/** CPF (11) or CNPJ (14) digits, check digits verified. */
	document: string;
};

export type BuyerField = 'name' | 'email' | 'phone' | 'document';

export type FieldErrorCode =
	| 'name_invalid'
	| 'email_invalid'
	| 'phone_invalid'
	| 'document_invalid'
	/** Alphanumeric CNPJ (2026): not supported yet, the Cliente is pointed to support. */
	| 'document_alphanumeric';

export type FieldErrors = Partial<Record<BuyerField, FieldErrorCode>>;

export type NormalizeBuyerInputResult = { ok: true; buyer: BuyerInput } | { ok: false; fieldErrors: FieldErrors };

function checkDigit(digits: string, length: number, weights: number[]): number {
	let sum = 0;
	for (let i = 0; i < length; i++) sum += Number(digits[i]) * weights[i];
	const rest = sum % 11;
	return rest < 2 ? 0 : 11 - rest;
}

function hasValidCheckDigits(digits: string, weights1: number[], weights2: number[]): boolean {
	if (/^(\d)\1+$/.test(digits)) return false;
	const base = digits.length - 2;
	return checkDigit(digits, base, weights1) === Number(digits[base]) && checkDigit(digits, base + 1, weights2) === Number(digits[base + 1]);
}

/** `digits` is digits only; wrong length, all-equal digits and wrong check digits are invalid. */
export function isValidCpf(digits: string): boolean {
	return /^\d{11}$/.test(digits) && hasValidCheckDigits(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
}

/** `digits` is digits only; wrong length, all-equal digits and wrong check digits are invalid. */
export function isValidCnpj(digits: string): boolean {
	return (
		/^\d{14}$/.test(digits) &&
		hasValidCheckDigits(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
	);
}

function parseName(raw: unknown): Pick<BuyerInput, 'firstName' | 'lastName'> | null {
	if (typeof raw !== 'string') return null;
	const [firstName, ...rest] = raw.trim().split(/\s+/);
	if (rest.length === 0) return null;
	return { firstName, lastName: rest.join(' ') };
}

function parseEmail(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const email = normalizeEmail(raw);
	if (email === null || /\s/.test(email)) return null;
	const domain = email.slice(email.lastIndexOf('@') + 1);
	// `normalizeEmail` is deliberately shallow; a payable address needs a dotted domain.
	return /^[^.]+(\.[^.]+)+$/.test(domain) ? email : null;
}

function parsePhone(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	let digits = raw.replace(/\D/g, '');
	if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
	// DDD 11-99 (no leading zero), then 8 or 9 digits.
	return /^[1-9]\d[0-9]{8,9}$/.test(digits) ? digits : null;
}

function parseDocument(raw: unknown): { document: string } | { error: FieldErrorCode } {
	// Only a CNPJ-shaped string (14 letters or digits once punctuation is gone) points to
	// support; any other letters are a plain typo.
	if (typeof raw === 'string' && /[a-z]/i.test(raw) && /^[a-z0-9]{14}$/i.test(raw.replace(/[.\/-]/g, ''))) {
		return { error: 'document_alphanumeric' };
	}
	const digits = normalizeBuyerDocument(raw);
	if (digits === null) return { error: 'document_invalid' };
	const valid = digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
	return valid ? { document: digits } : { error: 'document_invalid' };
}

/** Reports every invalid field at once. `raw` is untrusted (a JSON body or form values). */
export function normalizeBuyerInput(raw: unknown): NormalizeBuyerInputResult {
	const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const fieldErrors: FieldErrors = {};

	const name = parseName(input.name);
	if (name === null) fieldErrors.name = 'name_invalid';
	const email = parseEmail(input.email);
	if (email === null) fieldErrors.email = 'email_invalid';
	const phone = parsePhone(input.phone);
	if (phone === null) fieldErrors.phone = 'phone_invalid';
	const document = parseDocument(input.document);
	if ('error' in document) fieldErrors.document = document.error;

	if (name === null || email === null || phone === null || 'error' in document) return { ok: false, fieldErrors };
	return { ok: true, buyer: { ...name, email, phone, document: document.document } };
}
