import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROBOT_BINARY_BYTES } from '../../../test/robot-binary-fixture';
import { dispatchDownloadLink } from './dispatch';
import { mintDownloadToken } from './download-tokens';
import { resolveDownload } from './download';

/**
 * .scratch/robot-delivery/issues/03-end-to-end-verification.md — the same
 * closing role `checkout-webhooks` ticket 07 and `customer-area` ticket 05
 * play for their efforts: the real path (mint → email → redeem) run
 * through the assembled modules, only the outbound Resend `fetch` mocked,
 * catching integration gaps ticket 02's own unit-level tests might miss.
 * Mirrors `identity/e2e.test.ts`'s "module functions, not real HTTP"
 * pattern — this repo's own resolved precedent for what "end-to-end" means
 * here, given no Playwright dependency exists anywhere in this repo.
 */

function mockResend() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		new Response(JSON.stringify({ id: 'resend-e2e' }), { status: 200 })
	);
}

async function seedCustomer(id: string, email: string): Promise<void> {
	const subscriptionId = `sub-${id}`;
	await env.DB.prepare('INSERT INTO subscriptions (id, plan_id, status) VALUES (?, ?, ?)')
		.bind(subscriptionId, 'starter', 'active')
		.run();
	await env.DB.prepare('INSERT INTO customers (id, subscription_id, email) VALUES (?, ?, ?)')
		.bind(id, subscriptionId, email)
		.run();
}

function tokenFromDownloadUrl(downloadUrl: string): string {
	const match = /\/download\/([^/?#]+)/.exec(downloadUrl);
	if (match === null) throw new Error(`could not extract a token from ${downloadUrl}`);
	return match[1];
}

describe('robot-delivery end to end: mint to download', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: mint the link, capture it from the mocked Resend call, GET it, bytes match the fixture', async () => {
		await seedCustomer('cust-e2e-happy', 'e2e-happy@example.com');
		const fetchSpy = mockResend();

		const dispatch = await dispatchDownloadLink(env, { customerId: 'cust-e2e-happy', origin: 'https://example.com' });
		expect(dispatch.ok).toBe(true);
		if (!dispatch.ok) throw new Error('expected dispatch to succeed');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const emailBody = JSON.parse(String(init.body)) as { html: string };
		expect(emailBody.html).toContain(dispatch.downloadUrl);

		const token = tokenFromDownloadUrl(dispatch.downloadUrl);
		const download = await resolveDownload(env, token);

		expect(download.ok).toBe(true);
		if (!download.ok) throw new Error('expected download to succeed');
		const bytes = new Uint8Array(await new Response(download.body).arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
	});

	it('reuse: the same link redeemed a second time before expiry succeeds again', async () => {
		await seedCustomer('cust-e2e-reuse', 'e2e-reuse@example.com');
		mockResend();

		const dispatch = await dispatchDownloadLink(env, { customerId: 'cust-e2e-reuse', origin: 'https://example.com' });
		if (!dispatch.ok) throw new Error('expected dispatch to succeed');
		const token = tokenFromDownloadUrl(dispatch.downloadUrl);

		const first = await resolveDownload(env, token);
		const second = await resolveDownload(env, token);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (first.ok && second.ok) {
			const firstBytes = new Uint8Array(await new Response(first.body).arrayBuffer());
			const secondBytes = new Uint8Array(await new Response(second.body).arrayBuffer());
			expect(firstBytes).toEqual(ROBOT_BINARY_BYTES);
			expect(secondBytes).toEqual(ROBOT_BINARY_BYTES);
		}
	});

	it('expiry: a token past its expires_at is rejected by GET /download/:token', async () => {
		const { token } = await mintDownloadToken(env, { customerId: 'cust-e2e-expired' });
		await env.DB.prepare('UPDATE download_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), token)
			.run();

		const result = await resolveDownload(env, token);

		expect(result).toEqual({ ok: false, status: 404 });
	});

	it('unknown token: a token never minted gets the identical error response as the expired case', async () => {
		const expiredToken = (await mintDownloadToken(env, { customerId: 'cust-e2e-compare' })).token;
		await env.DB.prepare('UPDATE download_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), expiredToken)
			.run();

		const expiredResult = await resolveDownload(env, expiredToken);
		const unknownResult = await resolveDownload(env, 'tok-never-minted');

		expect(unknownResult).toEqual(expiredResult);
		expect(unknownResult).toEqual({ ok: false, status: 404 });
	});
});
