/**
 * Admin gate — .scratch/storefront-v2/issues/04-admin-gate.md, ADR-0008 "Admin access is the
 * existing magic-link session plus an allowlist".
 *
 * There is no second login and no role table: an admin is a Cliente whose normalized e-mail
 * is in `ADMIN_EMAILS`. Unset or empty means nobody (fail closed, same convention as
 * `APPMAX_WEBHOOK_IPS` and `DEV_LOGIN_KEY`).
 *
 * Every non-admin outcome, signed in or not, is a plain 404 at the page/route adapter
 * (`src/pages/admin*`), so the area's existence is not revealed. `reason` exists for tests
 * and logs, never for the response. A state-changing admin route calls `assertSameOrigin`
 * as well; it answers 403, since by then the caller has already proved it is an admin.
 */

import { listCustomerPurchases, getCustomerEmail } from './customers';
import { normalizeEmail } from './normalize-email';
import { isSessionValid, requireSession } from './session';

type AdminEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'> & { ADMIN_EMAILS?: string };

export type AdminResult =
	| { ok: true; customerId: string; email: string }
	| { ok: false; reason: 'anonymous' | 'not-admin' };

/** The allowlist, normalized as Cliente e-mails are; entries that are not addresses drop out. */
function parseAdminEmails(raw: string | undefined): Set<string> {
	const emails = (raw ?? '')
		.split(',')
		.map((entry) => normalizeEmail(entry))
		.filter((entry): entry is string => entry !== null);
	return new Set(emails);
}

/** Whether `email` (any casing or padding) is on the allowlist. An unset list admits nobody. */
export function isAdminEmail(env: Pick<AdminEnv, 'ADMIN_EMAILS'>, email: string): boolean {
	const normalized = normalizeEmail(email);
	return normalized !== null && parseAdminEmails(env.ADMIN_EMAILS).has(normalized);
}

/**
 * A valid session whose Cliente e-mail is allowlisted. Unlike `/conta` (cookie-only), this also
 * reads the `sessions` revocation row: a logged-out admin's replayed cookie must not open the
 * catalog editor, the same stance the cancel-subscription action takes. The session names a
 * customer id, not an e-mail, so the e-mail is one more D1 read; admin traffic is a handful of
 * requests, so neither read matters.
 */
export async function requireAdmin(request: Request, env: AdminEnv): Promise<AdminResult> {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (!session.ok) return { ok: false, reason: 'anonymous' };
	if (!(await isSessionValid(env, session.sessionId))) return { ok: false, reason: 'anonymous' };

	const email = await getCustomerEmail(env, session.customerId);
	if (email === null || !isAdminEmail(env, email)) return { ok: false, reason: 'not-admin' };

	return { ok: true, customerId: session.customerId, email };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF check for state-changing admin requests: the `Origin` header must be exactly the site
 * origin (scheme, host and port). Missing, `null` and malformed values are rejected: browsers
 * send `Origin` on every cross-origin and every same-origin POST, so its absence is never a
 * legitimate admin form. Safe methods pass untouched; admin GETs must therefore never write.
 */
export function assertSameOrigin(request: Request): { ok: true } | { ok: false } {
	if (SAFE_METHODS.has(request.method)) return { ok: true };
	const origin = request.headers.get('Origin');
	return origin === new URL(request.url).origin ? { ok: true } : { ok: false };
}

/**
 * The preamble every admin page and route shares: `requireAdmin` (any non-admin is an empty
 * 404), then, when `checkOrigin` is set, `assertSameOrigin` (a foreign Origin is 403, so the
 * order stays "not admin" before "wrong origin"). On success `headers` (a page's
 * `Astro.response.headers`) gets `Cache-Control: private, no-store`. A caller returns
 * `gate.response` as is when `gate.ok` is false.
 */
export async function gateAdmin(
	request: Request,
	env: AdminEnv,
	options: { checkOrigin?: boolean; headers?: Headers } = {}
): Promise<{ ok: true; admin: { customerId: string; email: string } } | { ok: false; response: Response }> {
	const admin = await requireAdmin(request, env);
	if (!admin.ok) return { ok: false, response: new Response(null, { status: 404 }) };
	if (options.checkOrigin && !assertSameOrigin(request).ok) return { ok: false, response: new Response(null, { status: 403 }) };
	options.headers?.set('Cache-Control', 'private, no-store');
	return { ok: true, admin: { customerId: admin.customerId, email: admin.email } };
}

/**
 * Where a freshly signed-in Cliente lands. An allowlisted address with no purchases has no
 * `/conta` (it redirects to `/login`), so it goes to `/admin`; an admin who also bought keeps
 * `/conta`, the page they were sent to before this gate existed.
 */
export async function landingPathAfterLogin(env: AdminEnv, customerId: string): Promise<'/admin' | '/conta'> {
	const email = await getCustomerEmail(env, customerId);
	if (email === null || !isAdminEmail(env, email)) return '/conta';
	const purchases = await listCustomerPurchases(env, customerId);
	return purchases.length === 0 ? '/admin' : '/conta';
}
