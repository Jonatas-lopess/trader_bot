import { describe, expect, it } from 'vitest';
import { deadLinks } from './dead-links';
import { supportLinks } from './footer';
import { politicaDePrivacidade, termosDeUso, withdrawalHref } from './legal';
import { supportEmail, supportMailto } from './support';

describe('support channel', () => {
	it('is one launch-blocked e-mail address (the production domain is a go-live prerequisite)', () => {
		expect(supportEmail.blocked).toBe(true);
		expect(supportEmail.value).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
		expect(supportEmail.reason).toMatch(/domain/i);
	});

	it('builds a mailto: href from the address', () => {
		expect(supportMailto()).toBe(`mailto:${supportEmail.value}`);
	});

	it('footer Contato is a real mailto link, last, after Termos, Privacidade and the withdrawal clause', () => {
		const links = supportLinks.map((l) => ('href' in l ? l.href : null));
		expect(links).toEqual([termosDeUso.path, politicaDePrivacidade.path, withdrawalHref, supportMailto()]);
		expect(supportLinks.some((l) => 'dead' in l)).toBe(false);
	});

	it('leaves no dead link in the inventory', () => {
		expect(Object.keys(deadLinks)).toEqual([]);
	});
});
