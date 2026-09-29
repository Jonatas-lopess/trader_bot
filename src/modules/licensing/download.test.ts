import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { licenseBinaryKey, ROBOT_BINARY_BYTES } from '../../../test/robot-binary-fixture';
import { seedLicense } from '../../../test/license-seed';
import { mintDownloadToken } from './download-tokens';
import { resolveDownload } from './download';

// The composed redeem-check-stream resolver behind `GET /download/:token`,
// kept out of `src/pages/download/[token].ts` and testable on its own —
// this repo's established "thin Astro adapter around a plain module
// function" convention (`modules/licensing/account-page.ts`'s header).
describe('resolveDownload', () => {
	it('streams the per-Licença binary for a freshly minted token', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-1');
		const { token } = await mintDownloadToken(env, { customerId, licenseId });

		const result = await resolveDownload(env, token);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok result');
		expect(result.filename).toBe('lic-resolve-1.ex5');
		const bytes = new Uint8Array(await new Response(result.body).arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
	});

	it('streams the object of the token\'s own Licença, not another one\'s', async () => {
		const first = await seedLicense('lic-resolve-own-a');
		const second = await seedLicense('lic-resolve-own-b');
		await env.ROBOT_BINARY.put(licenseBinaryKey(second.licenseId), new TextEncoder().encode('SECOND-LICENSE-BINARY'));
		const { token } = await mintDownloadToken(env, { customerId: first.customerId, licenseId: first.licenseId });

		const result = await resolveDownload(env, token);

		if (!result.ok) throw new Error('expected ok result');
		expect(new Uint8Array(await new Response(result.body).arrayBuffer())).toEqual(ROBOT_BINARY_BYTES);
	});

	it('succeeds again on a second GET within the TTL — reusable, not single-use', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-2');
		const { token } = await mintDownloadToken(env, { customerId, licenseId });

		const first = await resolveDownload(env, token);
		const second = await resolveDownload(env, token);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
	});

	it('rejects an expired token with a 404', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-3');
		const { token } = await mintDownloadToken(env, { customerId, licenseId });
		await env.DB.prepare('UPDATE download_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), token)
			.run();

		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
	});

	it('rejects an unknown token with the identical response as an expired one', async () => {
		expect(await resolveDownload(env, 'tok-does-not-exist')).toEqual({ ok: false, status: 404 });
	});

	it('404s a token whose license id matches no Licença', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-x', licenseId: 'lic-does-not-exist' });

		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
	});

	it('refuses an already-minted token once the purchase is refunded', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-refunded');
		const { token } = await mintDownloadToken(env, { customerId, licenseId });
		await env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = ?").bind(licenseId).run();

		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
	});

	it('refuses an already-minted token once the Licença has expired', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-expired');
		const { token } = await mintDownloadToken(env, { customerId, licenseId });
		await env.DB.prepare('UPDATE licenses SET expires_at = ? WHERE purchase_id = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), licenseId)
			.run();

		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
	});

	it('500s when an active Licença has no binary in R2', async () => {
		const { licenseId, customerId } = await seedLicense('lic-resolve-nobinary', { uploadBinary: false });
		const { token } = await mintDownloadToken(env, { customerId, licenseId });

		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 500 });
	});
});
