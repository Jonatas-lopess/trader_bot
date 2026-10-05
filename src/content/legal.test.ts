import { describe, expect, it } from 'vitest';
import { deadLinks } from './dead-links';
import { supportLinks } from './footer';
import { politicaDePrivacidade, termosDeUso, withdrawalBody, withdrawalHeading } from './legal';

describe('legal pages content', () => {
	it.each([termosDeUso, politicaDePrivacidade])('$path has sections, all launch-blocked placeholders', (page) => {
		expect(page.sections.length).toBeGreaterThan(0);
		for (const section of page.sections) {
			expect(section.body.blocked).toBe(true);
			expect(section.body.value).toMatch(/^TODO/);
		}
	});

	it('termos carries the launch-blocked CDC art. 49 withdrawal clause', () => {
		const section = termosDeUso.sections.find((s) => s.heading === withdrawalHeading);
		expect(section?.body).toBe(withdrawalBody);
		expect(withdrawalBody.blocked).toBe(true);
		expect(withdrawalBody.reason).toMatch(/art\. 49/);
	});

	it('footer links both pages; only Contato stays dead', () => {
		const hrefs = supportLinks.flatMap((l) => ('href' in l ? [l.href] : []));
		expect(hrefs).toEqual([termosDeUso.path, politicaDePrivacidade.path]);
		const deadLabels = supportLinks.flatMap((l) => ('dead' in l ? [l.label] : []));
		expect(deadLabels).toEqual([deadLinks.contato]);
		// The inventory also lists the /conta support button (same missing support channel).
		expect(Object.keys(deadLinks)).toEqual(['contato', 'suporte']);
	});
});
