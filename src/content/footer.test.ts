import { describe, expect, it } from 'vitest';
import { supportLinks } from './footer';
import { withdrawalHeading, withdrawalHref } from './legal';

describe('footer "Suporte & Termos"', () => {
	it('links the Termos withdrawal clause by its anchor', () => {
		expect(supportLinks).toContainEqual({ label: withdrawalHeading, href: withdrawalHref });
	});
});
