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

import { sendMagicLinkEmail } from './resend-client';
import { createSession } from './session';

const TOKEN_TTL_MS = 15 * 60 * 1000;

type RequestEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY' | 'LOGIN_RATE_LIMITER'>;
type RedeemEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'>;

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

	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
	await env.DB.prepare('INSERT INTO login_tokens (token, customer_id, expires_at) VALUES (?, ?, ?)')
		.bind(token, customer.id, expiresAt)
		.run();

	const magicLinkUrl = new URL(`/login/verify?token=${token}`, params.origin).toString();
	await sendMagicLinkEmail(env, { to: email, magicLinkUrl });
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
