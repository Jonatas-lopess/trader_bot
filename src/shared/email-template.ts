/**
 * Shared HTML + plain-text renderer for transactional e-mails.
 *
 * E-mail clients ignore external CSS, Tailwind and web fonts, so this is table layout with
 * inline styles and system-font fallbacks. Colors mirror the site tokens in
 * `src/styles/global.css` (surface-base/raised, brand-primary, text-*); keep them in sync by hand.
 * The button is a bulletproof `<a>` padded inside a `<td>` so Outlook renders it too.
 */

import { emailBrand, emailFooter, type EmailContent } from '../content/emails';

const color = {
	page: '#10141d', // surface-base
	card: '#171e29', // surface-raised
	border: '#1e293b', // border-subtle
	text: '#f1f5f9', // text-primary
	muted: '#94a3b8', // text-secondary
	brand: '#89b4fa', // brand-primary
	onBrand: '#10141d', // text-on-brand
} as const;

const font = "'Geist','Manrope',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderEmail(content: EmailContent, params: { url: string }): RenderedEmail {
	const url = escapeHtml(params.url);

	const paragraphs = content.paragraphs
		.map(
			(p) =>
				`<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${color.text};">${escapeHtml(p)}</p>`
		)
		.join('');

	const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${color.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${color.page};">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 0 24px;font-family:${font};font-size:20px;font-weight:700;color:${color.text};">${escapeHtml(emailBrand)}</td></tr>
<tr><td style="background-color:${color.card};border:1px solid ${color.border};border-radius:12px;padding:32px;font-family:${font};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:${color.text};">${escapeHtml(content.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr><td align="center" bgcolor="${color.brand}" style="border-radius:8px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:600;line-height:20px;color:${color.onBrand};text-decoration:none;border-radius:8px;">${escapeHtml(content.cta)}</a></td></tr>
</table>
<p style="margin:0 0 24px;font-size:14px;line-height:20px;color:${color.muted};">${escapeHtml(content.note)}</p>
<p style="margin:0 0 4px;padding-top:16px;border-top:1px solid ${color.border};font-size:13px;line-height:20px;color:${color.muted};">${escapeHtml(content.fallback)}</p>
<p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" style="color:${color.brand};text-decoration:underline;">${url}</a></p>
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${font};font-size:12px;line-height:18px;color:${color.muted};">
${escapeHtml(content.disclaimer)}<br>
${escapeHtml(emailFooter.support)} <a href="mailto:${escapeHtml(emailFooter.supportEmail)}" style="color:${color.brand};text-decoration:underline;">${escapeHtml(emailFooter.supportEmail)}</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	const text = [
		content.heading,
		'',
		...content.paragraphs.flatMap((p) => [p, '']),
		`${content.cta}: ${params.url}`,
		'',
		content.note,
		'',
		'—',
		content.disclaimer,
		`${emailFooter.support} ${emailFooter.supportEmail}.`,
	].join('\n');

	return { subject: content.subject, html, text };
}
