import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchDownloadLink } from './dispatch';

// Only the outbound Resend `fetch` is mocked (spec.md's Testing Decisions,
// as re-stated by ticket 02) — D1 runs against the real binding from
// ticket 01.
function mockResend(response: { ok: boolean } = { ok: true }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		response.ok ? new Response(JSON.stringify({ id: 'resend-test' }), { status: 200 }) : new Response('nope', { status: 500 })
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

describe('dispatchDownloadLink', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('mints a token, writes it to download_tokens, and emails the download link', async () => {
		await seedCustomer('cust-dispatch-1', 'dispatch1@example.com');
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { customerId: 'cust-dispatch-1', origin: 'https://example.com' });

		expect(result).toMatchObject({ ok: true, email: 'dispatch1@example.com' });
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const { results } = await env.DB.prepare('SELECT * FROM download_tokens WHERE customer_id = ?')
			.bind('cust-dispatch-1')
			.all();
		expect(results).toHaveLength(1);

		if (!result.ok) throw new Error('expected ok result');
		expect(result.downloadUrl).toContain('https://example.com/download/');

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { to: string[] };
		expect(body.to).toEqual(['dispatch1@example.com']);
		expect(String(init.body)).toContain(result.downloadUrl);
	});

	it('returns a not-found reason and sends no email for an unknown customer id', async () => {
		const fetchSpy = mockResend();

		const result = await dispatchDownloadLink(env, { customerId: 'cust-does-not-exist', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'customer_not_found' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns an email-failed reason when Resend is unavailable, token already minted', async () => {
		await seedCustomer('cust-dispatch-2', 'dispatch2@example.com');
		mockResend({ ok: false });

		const result = await dispatchDownloadLink(env, { customerId: 'cust-dispatch-2', origin: 'https://example.com' });

		expect(result).toEqual({ ok: false, reason: 'email_failed' });
		const { results } = await env.DB.prepare('SELECT * FROM download_tokens WHERE customer_id = ?')
			.bind('cust-dispatch-2')
			.all();
		expect(results).toHaveLength(1);
	});
});
