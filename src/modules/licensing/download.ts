/**
 * View-model resolver for `GET /download/:token` — .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md.
 *
 * Kept out of `src/pages/download/[token].ts`'s handler and testable on its
 * own, mirroring this repo's established "thin Astro adapter around a plain
 * module function" convention (`modules/licensing/account-page.ts`).
 *
 * Redeem-then-stream, in that order: `redeemDownloadToken` alone is what
 * makes "unknown token" and "expired token" byte-identical (`status: 404`
 * either way) — an R2 object genuinely missing is a distinct, unexpected
 * failure (the one fixed binary should always be there), so it gets its own
 * `status: 500` rather than being folded into the same response.
 */

import { redeemDownloadToken } from './download-tokens';
import { streamRobotBinary } from './robot-binary';

type DownloadEnv = Pick<Cloudflare.Env, 'DB' | 'ROBOT_BINARY'>;

export type ResolveDownloadResult =
	| { ok: true; body: ReadableStream; contentType: string; filename: string; size: number }
	| { ok: false; status: 404 | 500 };

export async function resolveDownload(env: DownloadEnv, token: string): Promise<ResolveDownloadResult> {
	const redeemed = await redeemDownloadToken(env, token);
	if (!redeemed.ok) return { ok: false, status: 404 };

	const streamed = await streamRobotBinary(env);
	if (!streamed.ok) return { ok: false, status: 500 };

	return streamed;
}
