import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedLicense } from '../../../test/license-seed';
import { activateLicense } from './activate';

function mockResend() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: 'resend-test' }), { status: 200 }));
}

async function licenseStatus(id: string): Promise<string | undefined> {
	const row = await env.DB.prepare('SELECT status FROM licenses WHERE purchase_id = ?').bind(id).first<{ status: string }>();
	return row?.status;
}

describe('activateLicense', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('flips a preparing Licença to active and emails the link', async () => {
		await seedLicense('lic-activate-1', { licenseStatus: 'preparing', email: 'activate1@example.com' });
		const fetchSpy = mockResend();

		const result = await activateLicense(env, { licenseId: 'lic-activate-1', origin: 'https://example.com' });

		expect(result).toMatchObject({ ok: true, email: 'activate1@example.com' });
		expect(await licenseStatus('lic-activate-1')).toBe('active');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('refuses an awaiting_account Licença (no Corretora account yet)', async () => {
		await seedLicense('lic-activate-2', { licenseStatus: 'awaiting_account' });
		const fetchSpy = mockResend();

		const result = await activateLicense(env, { licenseId: 'lic-activate-2', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'not_preparing' });
		expect(await licenseStatus('lic-activate-2')).toBe('awaiting_account');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses when the binary was not uploaded, leaving the Licença preparing', async () => {
		await seedLicense('lic-activate-3', { licenseStatus: 'preparing', uploadBinary: false });
		const fetchSpy = mockResend();

		const result = await activateLicense(env, { licenseId: 'lic-activate-3', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'binary_missing' });
		expect(await licenseStatus('lic-activate-3')).toBe('preparing');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses a refunded purchase', async () => {
		await seedLicense('lic-activate-4', { licenseStatus: 'preparing', purchaseStatus: 'refunded' });

		const result = await activateLicense(env, { licenseId: 'lic-activate-4', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'purchase_not_payable' });
		expect(await licenseStatus('lic-activate-4')).toBe('preparing');
	});

	it('does not send a second link when run twice', async () => {
		await seedLicense('lic-activate-5', { licenseStatus: 'preparing' });
		const fetchSpy = mockResend();

		await activateLicense(env, { licenseId: 'lic-activate-5', origin: 'https://example.com' });
		const second = await activateLicense(env, { licenseId: 'lic-activate-5', origin: 'https://example.com' });

		expect(second).toEqual({ ok: false, reason: 'not_preparing' });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('leaves the Licença active when the email fails, so the link can be resent', async () => {
		await seedLicense('lic-activate-6', { licenseStatus: 'preparing' });
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 422 }));

		const result = await activateLicense(env, { licenseId: 'lic-activate-6', origin: 'https://example.com' });

		expect(result).toMatchObject({ ok: false, reason: 'email_failed' });
		expect(await licenseStatus('lic-activate-6')).toBe('active');
	});

	it('refuses without flipping when the purchase has no customers row', async () => {
		await seedLicense('lic-activate-7', { licenseStatus: 'preparing' });
		await env.DB.prepare('UPDATE purchases SET customer_id = NULL WHERE id = ?').bind('lic-activate-7').run();

		const result = await activateLicense(env, { licenseId: 'lic-activate-7', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'customer_not_found' });
		expect(await licenseStatus('lic-activate-7')).toBe('preparing');
	});
});
