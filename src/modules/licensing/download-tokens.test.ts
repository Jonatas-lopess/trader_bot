import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { mintDownloadToken, redeemDownloadToken } from './download-tokens';

describe('mintDownloadToken', () => {
	it('writes a row with a 48h expires_at and no used_at', async () => {
		const before = Date.now();
		const { token, expiresAt } = await mintDownloadToken(env, { customerId: 'cust-mint-1' });

		const row = await env.DB.prepare('SELECT * FROM download_tokens WHERE token = ?').bind(token).first<{
			customer_id: string;
			expires_at: string;
			used_at: string | null;
		}>();
		expect(row).toMatchObject({ customer_id: 'cust-mint-1', expires_at: expiresAt, used_at: null });

		const ttlMs = new Date(expiresAt).getTime() - before;
		expect(ttlMs).toBeGreaterThan(47 * 60 * 60 * 1000);
		expect(ttlMs).toBeLessThanOrEqual(48 * 60 * 60 * 1000 + 1000);
	});
});

describe('redeemDownloadToken', () => {
	it('succeeds for an unexpired token and sets used_at', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-redeem-1' });

		const result = await redeemDownloadToken(env, token);

		expect(result).toEqual({ ok: true });
		const row = await env.DB.prepare('SELECT used_at FROM download_tokens WHERE token = ?')
			.bind(token)
			.first<{ used_at: string | null }>();
		expect(row?.used_at).not.toBeNull();
	});

	it('succeeds again on a second redemption within the TTL — reusable, not single-use', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-redeem-2' });

		const first = await redeemDownloadToken(env, token);
		const second = await redeemDownloadToken(env, token);

		expect(first).toEqual({ ok: true });
		expect(second).toEqual({ ok: true });
	});

	it('rejects an expired token', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-redeem-3' });
		await env.DB.prepare('UPDATE download_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), token)
			.run();

		const result = await redeemDownloadToken(env, token);

		expect(result).toEqual({ ok: false });
	});

	it('rejects an unknown token with the identical response shape as an expired one', async () => {
		const result = await redeemDownloadToken(env, 'tok-does-not-exist');

		expect(result).toEqual({ ok: false });
	});
});
