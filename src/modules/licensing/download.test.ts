import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { ROBOT_BINARY_BYTES } from '../../../test/robot-binary-fixture';
import { mintDownloadToken } from './download-tokens';
import { resolveDownload } from './download';

// The composed redeem-then-stream resolver behind `GET /download/:token`,
// kept out of `src/pages/download/[token].ts` and testable on its own —
// this repo's established "thin Astro adapter around a plain module
// function" convention (`modules/licensing/account-page.ts`'s header).
describe('resolveDownload', () => {
	it('streams the robot binary for a freshly minted token', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-resolve-1' });

		const result = await resolveDownload(env, token);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok result');
		const bytes = new Uint8Array(await new Response(result.body).arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
	});

	it('succeeds again on a second GET within the TTL — reusable, not single-use', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-resolve-2' });

		const first = await resolveDownload(env, token);
		const second = await resolveDownload(env, token);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
	});

	it('rejects an expired token with a 404', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-resolve-3' });
		await env.DB.prepare('UPDATE download_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), token)
			.run();

		const result = await resolveDownload(env, token);

		expect(result).toEqual({ ok: false, status: 404 });
	});

	it('rejects an unknown token with the identical response as an expired one', async () => {
		const result = await resolveDownload(env, 'tok-does-not-exist');

		expect(result).toEqual({ ok: false, status: 404 });
	});
});
