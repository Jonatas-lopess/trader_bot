import { describe, expect, it } from 'vitest';
import { adminSections, ageLabel, deadLettersCount, emails } from './admin';

describe('admin content', () => {
	it('registers the dead-letter page as an in-area section', () => {
		expect(adminSections.some((section) => section.href === '/admin/emails')).toBe(true);
	});

	it('has unique section links', () => {
		const hrefs = adminSections.map((section) => section.href);
		expect(new Set(hrefs).size).toBe(hrefs.length);
	});

	it('words the unresolved count for zero, one and many', () => {
		expect(deadLettersCount(0)).toMatch(/Nenhum/);
		expect(deadLettersCount(1)).toMatch(/^1 e-mail/);
		expect(deadLettersCount(3)).toMatch(/^3 e-mails/);
	});

	it('has a flash line for every resend outcome', () => {
		for (const key of ['ok', 'failed', 'busy', 'already-resolved', 'no-body', 'not-found']) {
			expect(emails.flash).toHaveProperty(key);
		}
	});

	it('formats ages coarsely', () => {
		expect(ageLabel(5_000)).toBe('menos de 1 min');
		expect(ageLabel(5 * 60_000)).toBe('5 min');
		expect(ageLabel(3 * 3_600_000)).toBe('3 h');
		expect(ageLabel(2 * 86_400_000)).toBe('2 d');
	});
});
