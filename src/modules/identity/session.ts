/**
 * Session cookie + revocation store — .scratch/customer-area/issues/02-magic-link-login.md,
 * spec.md's "Session design — hybrid, not purely stateless".
 *
 * A signed cookie (session id, customer id, issued-at, expiry — 30 days) is
 * verified on every ordinary request with no D1 round-trip (PLANNING.md §3).
 * The `sessions` table is the revocation store: written at login
 * (`createSession`), consulted only at logout and (ticket 04) the
 * cancel-subscription action (`isSessionValid`) — never on ordinary page
 * loads, per spec.md's explicit "don't widen that DB check" note.
 *
 * Signing uses Web Crypto HMAC-SHA256 (PLANNING.md §3's CPU-budget note) —
 * `crypto.subtle` has no synchronous form in Workers, so verification is
 * `async` despite doing no I/O; the "no DB round-trip" guarantee is about
 * the D1 binding, not about awaiting.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'session';

type SessionEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'>;

function base64UrlEncode(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return base64UrlEncode(signature);
}

/** Constant-time string compare — the whole point of an HMAC check. Exported so other HMAC-verifying modules (stripe-webhook.ts) share one implementation. */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

export async function createSession(
	env: SessionEnv,
	customerId: string
): Promise<{ cookieValue: string; expiresAt: string }> {
	const sessionId = crypto.randomUUID();
	const issuedAtMs = Date.now();
	const expiresAtMs = issuedAtMs + THIRTY_DAYS_MS;
	const expiresAt = new Date(expiresAtMs).toISOString();

	await env.DB.prepare('INSERT INTO sessions (id, customer_id, expires_at) VALUES (?, ?, ?)')
		.bind(sessionId, customerId, expiresAt)
		.run();

	const payload = `${sessionId}.${customerId}.${issuedAtMs}.${expiresAtMs}`;
	const signature = await sign(payload, env.SESSION_SECRET);
	return { cookieValue: `${payload}.${signature}`, expiresAt };
}

export type VerifiedSession = { ok: true; sessionId: string; customerId: string };
export type SessionVerificationFailure = { ok: false };

/** Pure signature + expiry check — no D1 read (see file header). */
export async function verifySessionCookie(
	cookieValue: string,
	secret: string
): Promise<VerifiedSession | SessionVerificationFailure> {
	const parts = cookieValue.split('.');
	if (parts.length !== 5) return { ok: false };
	const [sessionId, customerId, issuedAtMs, expiresAtMs, signature] = parts;

	const payload = `${sessionId}.${customerId}.${issuedAtMs}.${expiresAtMs}`;
	const expectedSignature = await sign(payload, secret);
	if (!timingSafeEqual(signature, expectedSignature)) return { ok: false };

	const expiry = Number(expiresAtMs);
	if (!Number.isFinite(expiry) || expiry <= Date.now()) return { ok: false };

	return { ok: true, sessionId, customerId };
}

/** The one sanctioned D1 check — logout and (ticket 04) cancel only. */
export async function isSessionValid(env: SessionEnv, sessionId: string): Promise<boolean> {
	const row = await env.DB.prepare('SELECT 1 FROM sessions WHERE id = ? AND expires_at > ?')
		.bind(sessionId, new Date().toISOString())
		.first();
	return row !== null;
}

export async function revokeSession(env: SessionEnv, sessionId: string): Promise<void> {
	await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get('Cookie');
	if (header === null) return null;
	for (const part of header.split(';')) {
		const [key, ...rest] = part.trim().split('=');
		if (key === name) return rest.join('=');
	}
	return null;
}

/**
 * Ticket 02's session-check guard (spec.md user story 13): any
 * customer-area route calls this and redirects to `/login` on failure.
 * Cookie-only — no D1 read, matches the hybrid design's "ordinary page
 * loads" case.
 */
export async function requireSession(
	request: Request,
	secret: string
): Promise<VerifiedSession | SessionVerificationFailure> {
	const cookieValue = readCookie(request, COOKIE_NAME);
	if (cookieValue === null) return { ok: false };
	return verifySessionCookie(cookieValue, secret);
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
