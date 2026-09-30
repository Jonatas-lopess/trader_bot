import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
	it('lowercases the whole address', () => {
		expect(normalizeEmail('Ana.Silva@Example.COM')).toBe('ana.silva@example.com');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeEmail('  ana@example.com \n')).toBe('ana@example.com');
	});

	it('keeps plus-aliases and dots distinct (no provider-specific folding)', () => {
		expect(normalizeEmail('ana+robo@gmail.com')).toBe('ana+robo@gmail.com');
		expect(normalizeEmail('a.na@gmail.com')).toBe('a.na@gmail.com');
	});

	it.each(['', '   ', 'ana', 'ana.example.com', '@example.com', 'ana@', '@', 'a@b@example.com', 'ana@@example.com'])(
		'returns null for malformed %j',
		(raw) => {
			expect(normalizeEmail(raw)).toBeNull();
		}
	);

	it.each(['aná@example.com', 'ana@exämple.com', 'ana@例え.jp'])('returns null for non-ASCII %j', (raw) => {
		expect(normalizeEmail(raw)).toBeNull();
	});
});
