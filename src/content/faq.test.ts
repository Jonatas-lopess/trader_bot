import { describe, expect, it } from 'vitest';
import { faqItems } from './faq';
import { withdrawalHref } from './legal';
import { supportMailto } from './support';
import { unwrapLaunchBlocking } from '../shared/launch-blocking';

const indexOf = (question: string) => faqItems.findIndex((i) => i.question === question);

describe('FAQ withdrawal entry', () => {
	const cancelIdx = indexOf('Posso cancelar a qualquer momento?');
	const idx = indexOf('Posso pedir reembolso?');

	it('sits right after the cancel question', () => {
		expect(cancelIdx).toBeGreaterThanOrEqual(0);
		expect(idx).toBe(cancelIdx + 1);
	});

	it('is launch-blocked (lawyer confirms the wording)', () => {
		const answer = faqItems[idx]!.answer;
		expect(typeof answer).toBe('object');
		expect(answer).toMatchObject({ blocked: true });
		expect((answer as { reason: string }).reason).toMatch(/art\. 49/);
	});

	it('is scoped per Oferta: first charge only on Mensal, single payment on Compra and Anual', () => {
		const text = unwrapLaunchBlocking(faqItems[idx]!.answer);
		expect(text).toMatch(/7 dias para desistir da compra/);
		expect(text).toMatch(/Compra/);
		expect(text).toMatch(/Anual/);
		expect(text).toMatch(/Mensal/);
		expect(text).toMatch(/primeira cobrança/);
		expect(text).not.toMatch(/garantia/i);
	});

	it('links to the Termos clause anchor and the support e-mail', () => {
		const hrefs = faqItems[idx]!.links?.map((l) => l.href);
		expect(hrefs).toEqual([withdrawalHref, supportMailto()]);
	});
});
