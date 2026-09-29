import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedLicense } from '../../../test/license-seed';
import { dispatchDownloadLink } from './dispatch';

// Only the outbound Resend `fetch` is mocked (spec.md's Testing Decisions,
// as re-stated by ticket 02) — D1 runs against the real binding from
// ticket 01.
function mockResend(response: { ok: boolean } = { ok: true }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		response.ok
			? new Response(JSON.stringify({ id: 'resend-test' }), { status: 200 })
			: new Response(JSON.stringify({ name: 'validation_error', message: 'Invalid `to` field.' }), { status: 422 })
	);
}

describe('dispatchDownloadLink', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('mints a token, writes it to download_tokens, and emails the download link', async () => {
		await seedLicense('lic-dispatch-1', { email: 'dispatch1@example.com' });
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { licenseId: 'lic-dispatch-1', origin: 'https://example.com' });

		expect(result).toMatchObject({ ok: true, email: 'dispatch1@example.com' });
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const { results } = await env.DB.prepare('SELECT * FROM download_tokens WHERE customer_id = ?')
			.bind('cust-lic-dispatch-1')
			.all();
		expect(results).toHaveLength(1);

		if (!result.ok) throw new Error('expected ok result');
		expect(result.downloadUrl).toContain('https://example.com/download/');

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { to: string[] };
		expect(body.to).toEqual(['dispatch1@example.com']);
		expect(String(init.body)).toContain(result.downloadUrl);
	});

	it.each(['awaiting_account', 'preparing'] as const)(
		'refuses to mint for a %s Licença and sends no email',
		async (licenseStatus) => {
			await seedLicense(`lic-dispatch-${licenseStatus}`, { licenseStatus });
			const fetchSpy = mockResend();

			const result = await dispatchDownloadLink(env, { licenseId: `lic-dispatch-${licenseStatus}`, origin: 'https://example.com' });

			expect(result).toEqual({ ok: false, reason: 'license_not_active' });
			expect(fetchSpy).not.toHaveBeenCalled();
			const { results } = await env.DB.prepare('SELECT * FROM download_tokens WHERE license_id = ?')
				.bind(`lic-dispatch-${licenseStatus}`)
				.all();
			expect(results).toHaveLength(0);
		}
	);

	it('refuses to mint for a refunded purchase', async () => {
		await seedLicense('lic-dispatch-refunded', { purchaseStatus: 'refunded' });
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { licenseId: 'lic-dispatch-refunded', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'license_not_active' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses an unknown license id and sends no email', async () => {
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { licenseId: 'lic-does-not-exist', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'license_not_active' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns a not-found reason when an active Licença has no customers row', async () => {
		await seedLicense('lic-dispatch-nocustomer');
		await env.DB.prepare('DELETE FROM customers WHERE purchase_id = ?').bind('lic-dispatch-nocustomer').run();
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { licenseId: 'lic-dispatch-nocustomer', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'customer_not_found' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns an email-failed reason when Resend is unavailable, token already minted', async () => {
		await seedLicense('lic-dispatch-2', { email: 'dispatch2@example.com' });
		mockResend({ ok: false });

		const result = await dispatchDownloadLink(env, { licenseId: 'lic-dispatch-2', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'email_failed', detail: 'validation_error: Invalid `to` field.' });
		const { results } = await env.DB.prepare('SELECT * FROM download_tokens WHERE customer_id = ?')
			.bind('cust-lic-dispatch-2')
			.all();
		expect(results).toHaveLength(1);
	});
});
