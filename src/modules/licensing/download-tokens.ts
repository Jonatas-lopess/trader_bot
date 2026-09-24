/**
 * Download-link tokens — .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md,
 * PLANNING.md §8: opaque D1 token, 48h TTL, `used_at` telemetry-only.
 *
 * Unlike `identity/magic-link.ts`'s `login_tokens` (single-use,
 * check-and-consume), the grill settled this token as reusable within its
 * TTL: `redeemDownloadToken` never gates on `used_at IS NULL`, only on
 * `expires_at`. One atomic `UPDATE ... WHERE expires_at > ?` is both the
 * redemption check and the `used_at` write, same TOCTOU reasoning as the
 * rest of this codebase's compare-and-swap writes (PLANNING.md §6) — and it
 * naturally satisfies the "unknown token and expired token return the same
 * response" requirement: both simply fail to match zero rows, with nothing
 * downstream able to tell which.
 */

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

type DownloadTokensEnv = Pick<Cloudflare.Env, 'DB'>;

export async function mintDownloadToken(
	env: DownloadTokensEnv,
	params: { customerId: string }
): Promise<{ token: string; expiresAt: string }> {
	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
	await env.DB.prepare('INSERT INTO download_tokens (token, customer_id, expires_at) VALUES (?, ?, ?)')
		.bind(token, params.customerId, expiresAt)
		.run();
	return { token, expiresAt };
}

export type RedeemDownloadTokenResult = { ok: true } | { ok: false };

export async function redeemDownloadToken(env: DownloadTokensEnv, token: string): Promise<RedeemDownloadTokenResult> {
	const result = await env.DB.prepare('UPDATE download_tokens SET used_at = ? WHERE token = ? AND expires_at > ?')
		.bind(new Date().toISOString(), token, new Date().toISOString())
		.run();
	if (result.meta.changes === 0) return { ok: false };
	return { ok: true };
}
