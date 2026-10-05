import { describe, expect, it } from 'vitest';
import { downloadLinkEmail, emailFooter, magicLinkEmail } from '../content/emails';
import { escapeHtml, renderEmail } from './email-template';

const url = 'https://example.com/login/verify?token=abc&next=%2Fconta';

describe('renderEmail', () => {
	it('puts the subject through unchanged', () => {
		expect(renderEmail(magicLinkEmail, { url }).subject).toBe(magicLinkEmail.subject);
		expect(renderEmail(downloadLinkEmail, { url }).subject).toBe(downloadLinkEmail.subject);
	});

	it('html carries the button and the fallback link, with the URL attribute-escaped', () => {
		const { html } = renderEmail(magicLinkEmail, { url });
		const escaped = escapeHtml(url);
		expect(html.split(`href="${escaped}"`)).toHaveLength(3);
		expect(html).toContain(magicLinkEmail.cta);
		expect(html).toContain(magicLinkEmail.note);
		expect(html).toContain(`mailto:${emailFooter.supportEmail}`);
	});

	it('text carries the raw URL, the expiry note and the support address', () => {
		const { text } = renderEmail(downloadLinkEmail, { url });
		expect(text).toContain(url);
		expect(text).toContain(downloadLinkEmail.note);
		expect(text).toContain(emailFooter.supportEmail);
	});

	it('escapes markup in a hostile URL', () => {
		const { html } = renderEmail(magicLinkEmail, { url: 'https://x.test/"><script>alert(1)</script>' });
		expect(html).not.toContain('<script>');
	});
});
