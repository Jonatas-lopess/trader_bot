/**
 * Encomenda: a custom-Robô request — .scratch/storefront-v2/issues/14-encomenda-page.md,
 * CONTEXT.md, ADR-0008. A public form with no price and no payment; it never creates a Compra,
 * Licença or Cliente.
 *
 * `submitEncomenda` is the whole use case behind `POST /encomenda`: honeypot, validation,
 * per-IP rate limit, then INSERT into `custom_orders` and an e-mail to the operator through
 * `sendOrParkEmail` (the dead letter, ticket 16). The lead is stored before anything is sent, so
 * a failed e-mail is never a failed submission: it is parked, reported to Sentry and the visitor
 * still sees success. Unset `ORDER_NOTIFY_EMAIL` stores the lead and logs.
 *
 * Errors are stable codes only (`EncomendaFieldError`); copy lives in `src/content/encomenda.ts`.
 * Nothing here echoes the visitor's text into a log or a Sentry message: it is personal data.
 */

import * as Sentry from '@sentry/cloudflare';
import { operatorEmail, whatsappNumber, whatsappSummary } from '../../content/encomenda';
import { parseEmail, parsePhone } from '../billing/buyer-input';
import { sendOrParkEmail } from '../identity/send-with-dead-letter';

type EncomendaEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY' | 'ENCOMENDA_RATE_LIMITER'> & {
	ORDER_NOTIFY_EMAIL?: string;
	WHATSAPP_NUMBER?: string;
};

/** Hidden field real visitors never fill; any value marks the submission as a bot. */
export const HONEYPOT_FIELD = 'website';

export type EncomendaField = 'name' | 'email' | 'phone' | 'contact' | 'strategy' | 'market' | 'corretora' | 'consent';

export type EncomendaFieldError =
	| 'name_invalid'
	| 'email_invalid'
	| 'phone_invalid'
	/** Neither e-mail nor phone was given. */
	| 'contact_required'
	| 'strategy_invalid'
	| 'market_invalid'
	| 'corretora_invalid'
	| 'consent_required';

export type EncomendaFieldErrors = Partial<Record<EncomendaField, EncomendaFieldError>>;

/** A validated, normalized Encomenda. At least one of `email` / `phone` is set. */
export type EncomendaInput = {
	name: string;
	email: string | null;
	/** Digits only, DDD + 8 or 9 digits, no country code (`parsePhone`). */
	phone: string | null;
	strategy: string;
	/** '' when left blank. */
	market: string;
	/** '' when left blank. */
	corretora: string;
};

export type NormalizeEncomendaResult = { ok: true; input: EncomendaInput } | { ok: false; fieldErrors: EncomendaFieldErrors };

export type SubmitEncomendaResult =
	| { ok: true; whatsappHref: string | null }
	| { ok: false; reason: 'invalid'; fieldErrors: EncomendaFieldErrors }
	| { ok: false; reason: 'rate-limited' }
	| { ok: false; reason: 'storage-failed' };

const NAME_MIN = 2;
const NAME_MAX = 100;
const STRATEGY_MIN = 10;
const STRATEGY_MAX = 2000;
const SHORT_FIELD_MAX = 100;
const EMAIL_MAX = 254;
/** Encoded `text=` budget: wa.me links beyond roughly 2000 characters break in some clients. */
const WHATSAPP_TEXT_MAX_ENCODED = 1500;
const WHATSAPP_DIGITS = /^\d{10,15}$/;

// Bidi overrides and zero-width characters let a name look like something else in the operator's inbox.
const INVISIBLE_FORMATTING = /[​-‏‪-‮⁠-⁩﻿]/g;

/** One line: every control character (line breaks included) becomes a space, then whitespace collapses. */
function singleLine(raw: string): string {
	return raw.replace(INVISIBLE_FORMATTING, '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Free text: line breaks survive (as `\n`), other control characters are dropped, blank-line runs shrink. */
function multiLine(raw: string): string {
	return raw
		.replace(INVISIBLE_FORMATTING, '')
		.replace(/\r\n?/g, '\n')
		.replace(/\t/g, ' ')
		.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '')
		.replace(/[ ]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const isBlank = (raw: unknown): boolean => raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');

function parseContactEmail(raw: string): string | null {
	// The address becomes `reply_to`, so beyond `parseEmail` it must carry nothing a mail header
	// could read as structure (CR/LF, a second address, a display name).
	if (raw.length > EMAIL_MAX || /[\x00-\x20\x7f<>(),;:"\\\[\]]/.test(raw.trim())) return null;
	return parseEmail(raw);
}

/** Pure. `raw` is untrusted (form values or a JSON body); every invalid field is reported at once. */
export function normalizeEncomendaInput(raw: unknown): NormalizeEncomendaResult {
	const fields = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const fieldErrors: EncomendaFieldErrors = {};

	const name = typeof fields.name === 'string' ? singleLine(fields.name) : '';
	if (name.length < NAME_MIN || name.length > NAME_MAX) fieldErrors.name = 'name_invalid';

	let email: string | null = null;
	if (!isBlank(fields.email)) {
		email = typeof fields.email === 'string' ? parseContactEmail(fields.email) : null;
		if (email === null) fieldErrors.email = 'email_invalid';
	}

	let phone: string | null = null;
	if (!isBlank(fields.phone)) {
		phone = parsePhone(fields.phone);
		if (phone === null) fieldErrors.phone = 'phone_invalid';
	}

	if (isBlank(fields.email) && isBlank(fields.phone)) fieldErrors.contact = 'contact_required';

	const strategy = typeof fields.strategy === 'string' ? multiLine(fields.strategy) : '';
	if (strategy.length < STRATEGY_MIN || strategy.length > STRATEGY_MAX) fieldErrors.strategy = 'strategy_invalid';

	const market = typeof fields.market === 'string' ? singleLine(fields.market) : '';
	if (market.length > SHORT_FIELD_MAX || (!isBlank(fields.market) && typeof fields.market !== 'string')) {
		fieldErrors.market = 'market_invalid';
	}
	const corretora = typeof fields.corretora === 'string' ? singleLine(fields.corretora) : '';
	if (corretora.length > SHORT_FIELD_MAX || (!isBlank(fields.corretora) && typeof fields.corretora !== 'string')) {
		fieldErrors.corretora = 'corretora_invalid';
	}

	if (!(fields.consent === 'on' || fields.consent === 'true' || fields.consent === true)) {
		fieldErrors.consent = 'consent_required';
	}

	if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
	return { ok: true, input: { name, email, phone, strategy, market, corretora } };
}

const encodedLength = (text: string): number => encodeURIComponent(text).length;

/** Cuts by code point (never between a surrogate pair, which `encodeURIComponent` rejects) until the encoded text fits. */
function truncateForUrl(text: string): string {
	if (encodedLength(text) <= WHATSAPP_TEXT_MAX_ENCODED) return text;
	let chars = [...text];
	let candidate: string;
	do {
		chars = chars.slice(0, Math.floor(chars.length * 0.9));
		candidate = `${chars.join('').trimEnd()}…`;
	} while (chars.length > 0 && encodedLength(candidate) > WHATSAPP_TEXT_MAX_ENCODED);
	return candidate;
}

/** `https://wa.me/<digits>?text=<encoded>`, with the text truncated to a safe length; null without a usable number. */
export function buildWhatsappHref(number: string, text: string): string | null {
	const digits = number.replace(/\D/g, '');
	if (!WHATSAPP_DIGITS.test(digits)) return null;
	return `https://wa.me/${digits}?text=${encodeURIComponent(truncateForUrl(text))}`;
}

/** `WHATSAPP_NUMBER` when set, else the launch-blocking placeholder; a set but unusable value yields no link. */
function resolveWhatsappNumber(env: Pick<EncomendaEnv, 'WHATSAPP_NUMBER'>): string {
	const setting = env.WHATSAPP_NUMBER?.trim();
	return setting === undefined || setting === '' ? whatsappNumber.value : setting;
}

function whatsappText(input: EncomendaInput | null): string {
	if (input === null) return whatsappSummary.intro;
	const lines = [whatsappSummary.intro, `${whatsappSummary.name}: ${input.name}`];
	if (input.market !== '') lines.push(`${whatsappSummary.market}: ${input.market}`);
	if (input.corretora !== '') lines.push(`${whatsappSummary.corretora}: ${input.corretora}`);
	lines.push(`${whatsappSummary.strategy}: ${input.strategy}`);
	return lines.join('\n');
}

/** Plain text. The free-text strategy is indented so none of its lines can read as a header-style line of its own. */
function operatorBody(id: string, input: EncomendaInput): string {
	const { labels } = operatorEmail;
	return [
		operatorEmail.bodyIntro,
		'',
		`${labels.id}: ${id}`,
		`${labels.name}: ${input.name}`,
		`${labels.email}: ${input.email ?? operatorEmail.noEmail}`,
		`${labels.phone}: ${input.phone ?? operatorEmail.noPhone}`,
		`${labels.market}: ${input.market === '' ? operatorEmail.blank : input.market}`,
		`${labels.corretora}: ${input.corretora === '' ? operatorEmail.blank : input.corretora}`,
		'',
		`${labels.strategy}:`,
		...input.strategy.split('\n').map((line) => `  ${line}`),
	].join('\n');
}

/**
 * E-mails the operator and stamps `notified_at` on success. Never throws and never changes what
 * the visitor sees: a failure is parked by `sendOrParkEmail` and reported here, without the
 * lead's content.
 */
async function notifyOperator(env: EncomendaEnv, id: string, input: EncomendaInput): Promise<void> {
	const to = env.ORDER_NOTIFY_EMAIL === undefined ? null : parseEmail(env.ORDER_NOTIFY_EMAIL);
	if (to === null) {
		console.warn(`encomenda ${id}: ORDER_NOTIFY_EMAIL is unset or invalid; the lead is stored but the operator was not e-mailed`);
		return;
	}

	const result = await sendOrParkEmail(
		env,
		{
			to,
			// Only the validated address; absent when the requester left just a phone.
			replyTo: input.email ?? undefined,
			subject: `${operatorEmail.subjectPrefix} ${id.slice(0, 8)}`,
			body: operatorBody(id, input),
		},
		{ kind: 'encomenda', storeBody: true }
	);

	if (!result.ok) {
		Sentry.captureMessage('encomenda: operator e-mail failed', { level: 'error', extra: { lead_id: id, parked: result.parked } });
		return;
	}
	try {
		await env.DB.prepare('UPDATE custom_orders SET notified_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
	} catch (error) {
		Sentry.captureException(error, { tags: { area: 'encomenda' }, extra: { lead_id: id } });
	}
}

/**
 * Honeypot, then validation, then the per-IP limit (so fixing a typo does not spend a hit and
 * bots never reach D1), then store, then notify. A honeypot hit answers like a success but
 * stores and sends nothing.
 */
export async function submitEncomenda(
	env: EncomendaEnv,
	params: { fields: unknown; ip: string }
): Promise<SubmitEncomendaResult> {
	const resolvedWhatsappNumber = resolveWhatsappNumber(env);
	const fields = typeof params.fields === 'object' && params.fields !== null ? (params.fields as Record<string, unknown>) : {};

	if (!isBlank(fields[HONEYPOT_FIELD])) {
		return { ok: true, whatsappHref: buildWhatsappHref(resolvedWhatsappNumber, whatsappText(null)) };
	}

	const normalized = normalizeEncomendaInput(fields);
	if (!normalized.ok) return { ok: false, reason: 'invalid', fieldErrors: normalized.fieldErrors };
	const { input } = normalized;

	const limit = await env.ENCOMENDA_RATE_LIMITER.limit({ key: `ip:${params.ip}` });
	if (!limit.success) return { ok: false, reason: 'rate-limited' };

	const id = crypto.randomUUID();
	try {
		await env.DB.prepare(
			`INSERT INTO custom_orders (id, name, email, phone, strategy, market, corretora, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(id, input.name, input.email, input.phone, input.strategy, input.market, input.corretora, new Date().toISOString())
			.run();
	} catch (error) {
		Sentry.captureException(error, { tags: { area: 'encomenda' } });
		return { ok: false, reason: 'storage-failed' };
	}

	await notifyOperator(env, id, input);
	return { ok: true, whatsappHref: buildWhatsappHref(resolvedWhatsappNumber, whatsappText(input)) };
}
