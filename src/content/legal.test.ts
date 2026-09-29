import { describe, expect, it } from 'vitest';
import { deadLinks } from './dead-links';
import { supportLinks } from './footer';
import { politicaDePrivacidade, termosDeUso } from './legal';

describe('legal pages content', () => {
	it.each([termosDeUso, politicaDePrivacidade])('$path has sections, all launch-blocked placeholders', (page) => {
		expect(page.sections.length).toBeGreaterThan(0);
		for (const section of page.sections) {
			expect(section.body.blocked).toBe(true);
			expect(section.body.value).toMatch(/^TODO/);
		}
	});

	it('footer links both pages; only Contato stays dead', () => {
		const hrefs = supportLinks.flatMap((l) => ('href' in l ? [l.href] : []));
		expect(hrefs).toEqual([termosDeUso.path, politicaDePrivacidade.path]);
		expect(Object.keys(deadLinks)).toEqual(['contato']);
	});
});
