/**
 * View-model resolver for `GET /download/:token` — .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md.
 *
 * Kept out of `src/pages/download/[token].ts`'s handler and testable on its
 * own, mirroring this repo's established "thin Astro adapter around a plain
 * module function" convention (`modules/licensing/account-page.ts`).
 *
 * Redeem, check the Licença, then stream. `redeemDownloadToken` makes "unknown token" and
 * "expired token" byte-identical (`status: 404`); a token whose Licença is no longer
 * `active` (refunded, chargeback, expired) gets that same 404 — an already-minted link must
 * not outlive the Licença (catalog-pivot 08). An R2 object genuinely missing for an active
 * Licença is a distinct, unexpected failure, so it gets its own `status: 500`.
 */

import { redeemDownloadToken } from './download-tokens';
import { getLicenseStatusById } from './license-status';
import { streamRobotBinary } from './robot-binary';

type DownloadEnv = Pick<Cloudflare.Env, 'DB' | 'ROBOT_BINARY'>;

export type ResolveDownloadResult =
	| { ok: true; body: ReadableStream; contentType: string; filename: string; size: number }
	| { ok: false; status: 404 | 500 };

export async function resolveDownload(env: DownloadEnv, token: string): Promise<ResolveDownloadResult> {
	const redeemed = await redeemDownloadToken(env, token);
	if (!redeemed.ok) return { ok: false, status: 404 };

	const license = await getLicenseStatusById(env, redeemed.licenseId);
	if (license.status !== 'active') return { ok: false, status: 404 };

	const streamed = await streamRobotBinary(env, redeemed.licenseId);
	if (!streamed.ok) return { ok: false, status: 500 };

	return streamed;
}
