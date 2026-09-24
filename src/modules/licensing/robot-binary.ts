/**
 * R2-backed binary storage for the robot — the "binary storage" concern
 * PLANNING.md §4 lists for `modules/licensing`. One fixed object: CONTEXT.md
 * — "Robô: one program, not a family of them" — so there is no per-plan
 * variant to select between, just the one key in the `ROBOT_BINARY` bucket
 * (wrangler.jsonc).
 *
 * `.ex5` is the compiled-binary format MT5 Expert Advisors actually ship as
 * (CONTEXT.md). Served as `application/octet-stream` with an attachment
 * `Content-Disposition` (`download.ts`) — never HTML-attachment-shaped
 * (PLANNING.md §8 — "never as an attachment ... Executable attachments are
 * blocked outright").
 */

const ROBOT_BINARY_KEY = 'robo-trader.ex5';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

type RobotBinaryEnv = Pick<Cloudflare.Env, 'ROBOT_BINARY'>;

export type StreamRobotBinaryResult =
	| { ok: true; body: ReadableStream; contentType: string; filename: string; size: number }
	| { ok: false };

export async function streamRobotBinary(env: RobotBinaryEnv): Promise<StreamRobotBinaryResult> {
	const object = await env.ROBOT_BINARY.get(ROBOT_BINARY_KEY);
	if (object === null) return { ok: false };

	return {
		ok: true,
		body: object.body,
		contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
		filename: ROBOT_BINARY_KEY,
		size: object.size,
	};
}
