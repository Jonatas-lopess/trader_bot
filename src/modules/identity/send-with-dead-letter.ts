/**
 * E-mail dead letter — .scratch/storefront-v2/issues/16-email-dead-letter.md, ADR-0008.
 *
 * `sendOrParkEmail` sends through the Resend seam (`./resend-client.ts`) and, when the send
 * fails, parks the message in `email_dead_letters` instead of losing it; an admin resends it
 * from `/admin/emails` via `resendDeadLetter`. Lives beside the Resend client; the licensing
 * module's own client stays separate (see the ticket's Comments).
 *
 * Usage (ticket 14, the Encomenda notification):
 *
 *   const result = await sendOrParkEmail(env, { to, replyTo, subject, body }, { kind: 'encomenda' });
 *   // { ok: true }                  sent, nothing stored
 *   // { ok: false, parked: true }   Resend refused; the message waits in the dead letter
 *   // { ok: false, parked: false }  Resend refused AND the park failed (reported to Sentry)
 *
 * It never throws, so a caller that has already stored its own record (the Encomenda lead) can
 * ignore the result and still answer the visitor. Messages are plain text; the body is stored
 * verbatim, so pass `storeBody: false` for any e-mail whose body carries a secret (magic link,
 * download link): only metadata is parked and the row can never be resent. No cron retry; a
 * Workers cron trigger over the unresolved rows is the follow-up.
 */

import * as Sentry from '@sentry/cloudflare';
import { sendEmail, type OutboundEmail } from './resend-client';

type DeadLetterEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY'>;

export type { OutboundEmail };

export type SendOrParkResult = { ok: true } | { ok: false; parked: boolean };

export type ResendDeadLetterResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'already-resolved' | 'no-body' | 'busy' }
	| { ok: false; reason: 'send-failed'; detail: string };

/** What the admin list shows: no body (it is never displayed or edited). */
export type DeadLetterSummary = {
	id: string;
	kind: string;
	toAddress: string;
	replyTo: string | null;
	subject: string;
	/** False when parked with `storeBody: false`; such a row cannot be resent. */
	resendable: boolean;
	attempts: number;
	lastError: string;
	createdAt: string;
	lastAttemptAt: string;
	resolvedAt: string | null;
};

/** After any attempt on a row, a resend of it is refused for this long: the guard against a double click. */
const RESEND_LEASE_MS = 10_000;
/** Resolved rows listed below the unresolved ones. */
const RESOLVED_LIST_LIMIT = 50;
const MAX_ERROR_LENGTH = 500;

/** One send attempt as a value: a thrown fetch (network down) is a failed attempt, not an exception. */
async function attemptSend(
	env: Pick<Cloudflare.Env, 'RESEND_API_KEY'>,
	message: OutboundEmail
): Promise<{ ok: true } | { ok: false; detail: string }> {
	try {
		const result = await sendEmail(env, message);
		if (result.ok) return { ok: true };
		return { ok: false, detail: (result.detail ?? 'unknown error').slice(0, MAX_ERROR_LENGTH) };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, detail: `network error: ${reason}`.slice(0, MAX_ERROR_LENGTH) };
	}
}

export async function sendOrParkEmail(
	env: DeadLetterEnv,
	message: OutboundEmail,
	options: { kind: string; storeBody?: boolean }
): Promise<SendOrParkResult> {
	const sent = await attemptSend(env, message);
	if (sent.ok) return { ok: true };

	try {
		const now = new Date().toISOString();
		await env.DB.prepare(
			`INSERT INTO email_dead_letters (id, kind, to_address, reply_to, subject, body, attempts, last_error, created_at, last_attempt_at)
			 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
		)
			.bind(
				crypto.randomUUID(),
				options.kind,
				message.to,
				message.replyTo ?? null,
				message.subject,
				options.storeBody === false ? null : message.body,
				sent.detail,
				now,
				now
			)
			.run();
		return { ok: false, parked: true };
	} catch (error) {
		// The message is lost; make it loud, but without the body (it is the requester's text).
		Sentry.captureException(error, { tags: { area: 'email-dead-letter' }, extra: { kind: options.kind } });
		return { ok: false, parked: false };
	}
}

/**
 * Resends a parked message. The first statement claims the row (counts the attempt and starts
 * the lease only if the row is unresolved, has a body, and was not attempted in the last
 * `RESEND_LEASE_MS`), so two racing clicks send once: the loser gets `busy` or `already-resolved`.
 * Success sets `resolved_at` with a conditional UPDATE; failure records Resend's reason.
 */
export async function resendDeadLetter(env: DeadLetterEnv, id: string): Promise<ResendDeadLetterResult> {
	const now = Date.now();
	const claimed = await env.DB.prepare(
		`UPDATE email_dead_letters SET attempts = attempts + 1, last_attempt_at = ?
		 WHERE id = ? AND resolved_at IS NULL AND body IS NOT NULL AND last_attempt_at <= ?
		 RETURNING to_address, reply_to, subject, body`
	)
		.bind(new Date(now).toISOString(), id, new Date(now - RESEND_LEASE_MS).toISOString())
		.first<{ to_address: string; reply_to: string | null; subject: string; body: string }>();

	if (claimed === null) {
		const row = await env.DB.prepare('SELECT resolved_at, body FROM email_dead_letters WHERE id = ?')
			.bind(id)
			.first<{ resolved_at: string | null; body: string | null }>();
		if (row === null) return { ok: false, reason: 'not-found' };
		if (row.resolved_at !== null) return { ok: false, reason: 'already-resolved' };
		if (row.body === null) return { ok: false, reason: 'no-body' };
		return { ok: false, reason: 'busy' };
	}

	const sent = await attemptSend(env, {
		to: claimed.to_address,
		replyTo: claimed.reply_to ?? undefined,
		subject: claimed.subject,
		body: claimed.body,
	});

	if (sent.ok) {
		await env.DB.prepare('UPDATE email_dead_letters SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL')
			.bind(new Date().toISOString(), id)
			.run();
		return { ok: true };
	}
	await env.DB.prepare('UPDATE email_dead_letters SET last_error = ? WHERE id = ?').bind(sent.detail, id).run();
	return { ok: false, reason: 'send-failed', detail: sent.detail };
}

type SummaryRow = {
	id: string;
	kind: string;
	to_address: string;
	reply_to: string | null;
	subject: string;
	resendable: number;
	attempts: number;
	last_error: string;
	created_at: string;
	last_attempt_at: string;
	resolved_at: string | null;
};

const SUMMARY_COLUMNS = `id, kind, to_address, reply_to, subject, body IS NOT NULL AS resendable, attempts, last_error,
	created_at, last_attempt_at, resolved_at`;

function toSummary(row: SummaryRow): DeadLetterSummary {
	return {
		id: row.id,
		kind: row.kind,
		toAddress: row.to_address,
		replyTo: row.reply_to,
		subject: row.subject,
		resendable: row.resendable === 1,
		attempts: row.attempts,
		lastError: row.last_error,
		createdAt: row.created_at,
		lastAttemptAt: row.last_attempt_at,
		resolvedAt: row.resolved_at,
	};
}

/** Unresolved rows oldest first, then the most recently resolved ones. For the admin page; never selects a body. */
export async function listDeadLetters(
	env: Pick<Cloudflare.Env, 'DB'>
): Promise<{ unresolved: DeadLetterSummary[]; resolved: DeadLetterSummary[] }> {
	const [unresolved, resolved] = await Promise.all([
		env.DB.prepare(
			`SELECT ${SUMMARY_COLUMNS} FROM email_dead_letters WHERE resolved_at IS NULL ORDER BY created_at, rowid`
		).all<SummaryRow>(),
		env.DB.prepare(
			`SELECT ${SUMMARY_COLUMNS} FROM email_dead_letters WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT ?`
		)
			.bind(RESOLVED_LIST_LIMIT)
			.all<SummaryRow>(),
	]);
	return { unresolved: unresolved.results.map(toSummary), resolved: resolved.results.map(toSummary) };
}

export async function countUnresolvedDeadLetters(env: Pick<Cloudflare.Env, 'DB'>): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM email_dead_letters WHERE resolved_at IS NULL').first<{ n: number }>();
	return row?.n ?? 0;
}
