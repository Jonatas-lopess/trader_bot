/**
 * R2-backed binary storage for the robot — the "binary storage" concern
 * PLANNING.md §4 lists for `modules/licensing`. One object per Licença, at
 * `licenses/<license_id>.ex5` in the `ROBOT_BINARY` bucket (wrangler.jsonc): the Corretora
 * account is baked into each binary, so it is compiled separately per Licença
 * (ADR-0006, PLANNING.md §8; catalog-pivot ticket 08).
 *
 * `.ex5` is the compiled-binary format MT5 Expert Advisors actually ship as
 * (CONTEXT.md). Served as `application/octet-stream` with an attachment
 * `Content-Disposition` (`download.ts`) — never HTML-attachment-shaped
 * (PLANNING.md §8 — "never as an attachment ... Executable attachments are
 * blocked outright").
 */

import * as Sentry from '@sentry/cloudflare';

export const licenseBinaryKey = (licenseId: string): string => `licenses/${licenseId}.ex5`;
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

type RobotBinaryEnv = Pick<Cloudflare.Env, 'ROBOT_BINARY'>;

export type StreamRobotBinaryResult =
	| { ok: true; body: ReadableStream; contentType: string; filename: string; size: number }
	| { ok: false };

export async function streamRobotBinary(env: RobotBinaryEnv, licenseId: string): Promise<StreamRobotBinaryResult> {
	const key = licenseBinaryKey(licenseId);
	const object = await env.ROBOT_BINARY.get(key);
	if (object === null) {
		// An active Licença's object "should always be there" (the operator uploads it before
		// flipping to active) — unlike the token-expired/unknown-token 404 branch, this is not
		// an ordinary outcome, so it pages (ticket 05 audit finding).
		console.error(`streamRobotBinary: R2 object missing for key=${key}`);
		Sentry.captureMessage('streamRobotBinary: R2 object missing', {
			extra: { key, licenseId },
		});
		return { ok: false };
	}

	return {
		ok: true,
		body: object.body,
		contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
		filename: `${licenseId}.ex5`,
		size: object.size,
	};
}
