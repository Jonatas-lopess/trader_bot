/**
 * Magic-link request + redemption — .scratch/customer-area/issues/02-magic-link-login.md.
 *
 * `requestMagicLink` always behaves identically whether or not `email`
 * matches a `customers` row (spec.md user story 3 — `/login/request` must
 * return the same generic response either way; that branching lives in the
 * caller, not here, precisely so nothing here can leak a match/no-match
 * signal through its return type). `redeemMagicLink` is the one place a
 * token is single-use-checked-and-consumed, atomically.
 */

import * as Sentry from '@sentry/cloudflare';
import { sendMagicLinkEmail } from './resend-client';
import { createSession } from './session';

const TOKEN_TTL_MS = 15 * 60 * 1000;

type RequestEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY' | 'LOGIN_RATE_LIMITER'>;
type RedeemEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'>;
type IssueEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY'>;

/**
 * Mint-and-send, factored out of `requestMagicLink` so a caller that
 * already knows the customer (no email lookup, no throttle — e.g.
 * `webhook.ts`'s auto-send on first activation, customer-area ticket 06)
 * can reuse the exact same token/session-issuance path instead of a second
 * implementation. `requestMagicLink` itself becomes a thin wrapper: resolve
 * `email` -> `customerId`, then call this.
 *
 * Returns `{ ok }` (rather than `void`) so a caller that isn't the
 * fire-and-forget `/login` request path — `scripts/provision-customer.ts`'s
 * ops CLI, customer-area ticket 08 — can surface a send failure directly to
 * whoever's running it, instead of relying only on this function's own log.
 */
export async function issueMagicLink(
	env: IssueEnv,
	params: { customerId: string; email: string; origin: string }
): Promise<{ ok: boolean }> {
	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
	await env.DB.prepare('INSERT INTO login_tokens (token, customer_id, expires_at) VALUES (?, ?, ?)')
		.bind(token, params.customerId, expiresAt)
		.run();

	const magicLinkUrl = new URL(`/login/verify?token=${token}`, params.origin).toString();
	const sent = await sendMagicLinkEmail(env, { to: params.email, magicLinkUrl });
	// Previously discarded — a Resend outage (or a misconfigured key) left
	// no trace anywhere while the Cliente-facing response stayed identical
	// either way (User Story 3's generic redirect). Logged, not surfaced,
	// for the `/login` and webhook callers: the response contract is
	// unchanged, this is purely for ops visibility (customer-area ticket 06).
	if (!sent.ok) {
		console.error(`issueMagicLink: Resend send failed for customer_id=${params.customerId}`);
		Sentry.captureMessage('issueMagicLink: Resend send failed', {
			extra: { customer_id: params.customerId, email: params.email },
		});
	}
	return { ok: sent.ok };
}

/**
 * Basic per-email and per-IP throttle (spec.md — "no captcha or heavier
 * abuse tooling"), one Cloudflare Rate Limiting binding partitioned by key
 * prefix (ADR-0002's "no hand-rolled D1/KV counter", same stance as
 * `webhook-hardening.ts`'s WEBHOOK_RATE_LIMITER).
 */
async function isWithinThrottle(env: RequestEnv, email: string, ip: string): Promise<boolean> {
	const [emailOutcome, ipOutcome] = await Promise.all([
		env.LOGIN_RATE_LIMITER.limit({ key: `email:${email}` }),
		env.LOGIN_RATE_LIMITER.limit({ key: `ip:${ip}` }),
	]);
	return emailOutcome.success && ipOutcome.success;
}

/**
 * No return value carries whether `email` matched — `/login/request`
 * (the caller) redirects to the same generic confirmation regardless
 * (User Story 3). Throttled requests are silently dropped the same way a
 * non-match is: no distinguishable external behavior.
 */
export async function requestMagicLink(
	env: RequestEnv,
	params: { email: string; ip: string; origin: string }
): Promise<void> {
	// Normalized the same way `provisionCustomer` normalizes what it stores
	// (customers.ts) — otherwise a customer typing their email in different
	// casing/whitespace than Appmax reported it could never find their row
	// (code review finding).
	const email = params.email.trim().toLowerCase();
	if (!(await isWithinThrottle(env, email, params.ip))) return;

	const customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ?')
		.bind(email)
		.first<{ id: string }>();
	if (customer === null) return;

	await issueMagicLink(env, { customerId: customer.id, email, origin: params.origin });
}

export type RedeemMagicLinkResult =
	| { ok: true; cookieValue: string; expiresAt: string }
	| { ok: false };

export async function redeemMagicLink(env: RedeemEnv, token: string): Promise<RedeemMagicLinkResult> {
	// Single atomic check-and-consume statement — no prior SELECT, same
	// TOCTOU reasoning as the `subscriptions` CAS update (PLANNING.md §6):
	// a replayed token must never redeem twice, even under concurrent
	// requests for the same token.
	const result = await env.DB.prepare(
		'UPDATE login_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?'
	)
		.bind(new Date().toISOString(), token, new Date().toISOString())
		.run();
	if (result.meta.changes === 0) return { ok: false };

	// Not a TOCTOU read: the check-and-consume decision already happened
	// atomically above. This only resolves which customer the now-consumed
	// token belongs to.
	const row = await env.DB.prepare('SELECT customer_id FROM login_tokens WHERE token = ?')
		.bind(token)
		.first<{ customer_id: string }>();
	if (row === null) return { ok: false };

	const session = await createSession(env, row.customer_id);
	return { ok: true, ...session };
}
