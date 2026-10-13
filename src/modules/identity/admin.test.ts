import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { assertSameOrigin, gateAdmin, isAdminEmail, landingPathAfterLogin, requireAdmin } from './admin';
import { createSession, revokeSession, SESSION_COOKIE_NAME } from './session';

async function seedCustomerRow(id: string, email: string): Promise<void> {
	await env.DB.prepare('INSERT INTO customers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
		.bind(id, email)
		.run();
}

async function seedPurchase(customerId: string): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, customer_id) VALUES (?, 'starter', 'one_time', 0, 'active', ?)"
	)
		.bind(`purchase-${customerId}`, customerId)
		.run();
}

async function sessionRequest(customerId: string): Promise<{ request: Request; sessionId: string }> {
	const { cookieValue } = await createSession(env, customerId);
	const request = new Request('https://example.com/admin', { headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } });
	return { request, sessionId: cookieValue.split('.')[0] };
}

const withAdmins = (adminEmails: string | undefined) => ({ ...env, ADMIN_EMAILS: adminEmails });

describe('requireAdmin', () => {
	it('lets an allowlisted Cliente through', async () => {
		await seedCustomerRow('cust-adm-1', 'boss@example.com');
		const { request } = await sessionRequest('cust-adm-1');

		const result = await requireAdmin(request, withAdmins('boss@example.com'));

		expect(result).toEqual({ ok: true, customerId: 'cust-adm-1', email: 'boss@example.com' });
	});

	it('rejects a request with no session cookie', async () => {
		const result = await requireAdmin(new Request('https://example.com/admin'), withAdmins('boss@example.com'));

		expect(result).toEqual({ ok: false, reason: 'anonymous' });
	});

	it('rejects a signed-in Cliente who is not on the list', async () => {
		await seedCustomerRow('cust-adm-2', 'buyer@example.com');
		const { request } = await sessionRequest('cust-adm-2');

		const result = await requireAdmin(request, withAdmins('boss@example.com'));

		expect(result).toEqual({ ok: false, reason: 'not-admin' });
	});

	it('locks everyone out when ADMIN_EMAILS is unset, empty or only separators', async () => {
		await seedCustomerRow('cust-adm-3', 'boss3@example.com');
		const { request } = await sessionRequest('cust-adm-3');

		for (const unset of [undefined, '', '   ', ' , ,']) {
			expect(await requireAdmin(request, withAdmins(unset))).toEqual({ ok: false, reason: 'not-admin' });
		}
	});

	it('matches however the list or the Cliente address is cased or padded', async () => {
		await seedCustomerRow('cust-adm-4', 'second@example.com');
		const { request } = await sessionRequest('cust-adm-4');

		const result = await requireAdmin(request, withAdmins('  First@Example.com ,  SECOND@example.COM,, '));

		expect(result).toMatchObject({ ok: true, email: 'second@example.com' });
	});

	it('does not match on a substring or a plus-alias of a listed address', async () => {
		await seedCustomerRow('cust-adm-5', 'boss+x@example.com');
		const { request } = await sessionRequest('cust-adm-5');

		const result = await requireAdmin(request, withAdmins('boss@example.com'));

		expect(result).toEqual({ ok: false, reason: 'not-admin' });
	});

	it('rejects a forged cookie', async () => {
		const request = new Request('https://example.com/admin', {
			headers: { Cookie: `${SESSION_COOKIE_NAME}=a.b.1.99999999999999.sig` },
		});

		expect(await requireAdmin(request, withAdmins('boss@example.com'))).toEqual({ ok: false, reason: 'anonymous' });
	});

	it('rejects an admin whose session was revoked at logout', async () => {
		await seedCustomerRow('cust-adm-6', 'boss6@example.com');
		const { request, sessionId } = await sessionRequest('cust-adm-6');
		await revokeSession(env, sessionId);

		expect(await requireAdmin(request, withAdmins('boss6@example.com'))).toEqual({ ok: false, reason: 'anonymous' });
	});
});

describe('isAdminEmail', () => {
	it('is false for a malformed address even when the list holds it verbatim', () => {
		expect(isAdminEmail({ ADMIN_EMAILS: 'not-an-email' }, 'not-an-email')).toBe(false);
	});
});

describe('assertSameOrigin', () => {
	const request = (headers: Record<string, string>, method = 'POST') =>
		new Request('https://example.com/admin/robots', { method, headers });

	it('accepts a state-changing request whose Origin is the site origin', () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			expect(assertSameOrigin(request({ Origin: 'https://example.com' }, method))).toEqual({ ok: true });
		}
	});

	it('rejects a cross-origin POST', () => {
		expect(assertSameOrigin(request({ Origin: 'https://evil.example' }))).toEqual({ ok: false });
	});

	it('rejects a different scheme or port of the same host', () => {
		expect(assertSameOrigin(request({ Origin: 'http://example.com' }))).toEqual({ ok: false });
		expect(assertSameOrigin(request({ Origin: 'https://example.com:8443' }))).toEqual({ ok: false });
	});

	it('rejects a missing, opaque or malformed Origin on a state-changing request', () => {
		expect(assertSameOrigin(request({}))).toEqual({ ok: false });
		expect(assertSameOrigin(request({ Origin: 'null' }))).toEqual({ ok: false });
		expect(assertSameOrigin(request({ Origin: 'example.com' }))).toEqual({ ok: false });
	});

	it('does not look at Origin on safe methods', () => {
		expect(assertSameOrigin(new Request('https://example.com/admin'))).toEqual({ ok: true });
		expect(assertSameOrigin(request({ Origin: 'https://evil.example' }, 'GET'))).toEqual({ ok: true });
	});
});

describe('gateAdmin', () => {
	const post = (cookie: string | null, origin: string | null) =>
		new Request('https://example.com/admin/robos/new', {
			method: 'POST',
			headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
		});

	it('answers an empty 404 to a visitor with no session, before looking at the Origin', async () => {
		const gate = await gateAdmin(post(null, 'https://evil.example'), withAdmins('boss@example.com'), { checkOrigin: true });

		expect(gate.ok).toBe(false);
		if (gate.ok) return;
		expect(gate.response.status).toBe(404);
		expect(await gate.response.text()).toBe('');
	});

	it('answers an empty 404 to a signed-in non-admin', async () => {
		await seedCustomerRow('cust-gate-1', 'buyer-gate@example.com');
		const { request } = await sessionRequest('cust-gate-1');

		const gate = await gateAdmin(request, withAdmins('boss@example.com'));

		expect(gate.ok).toBe(false);
		if (!gate.ok) expect(gate.response.status).toBe(404);
	});

	it('answers 403 to an admin whose Origin is foreign, only when the origin is checked', async () => {
		await seedCustomerRow('cust-gate-2', 'boss-gate@example.com');
		const { cookieValue } = await createSession(env, 'cust-gate-2');
		const cookie = `${SESSION_COOKIE_NAME}=${cookieValue}`;
		const adminEnv = withAdmins('boss-gate@example.com');

		const checked = await gateAdmin(post(cookie, 'https://evil.example'), adminEnv, { checkOrigin: true });
		expect(checked.ok).toBe(false);
		if (!checked.ok) expect(checked.response.status).toBe(403);

		expect((await gateAdmin(post(cookie, 'https://evil.example'), adminEnv)).ok).toBe(true);
	});

	it('lets an admin through and marks the page response private, no-store', async () => {
		await seedCustomerRow('cust-gate-3', 'boss-gate3@example.com');
		const { cookieValue } = await createSession(env, 'cust-gate-3');
		const headers = new Headers();

		const gate = await gateAdmin(post(`${SESSION_COOKIE_NAME}=${cookieValue}`, 'https://example.com'), withAdmins('boss-gate3@example.com'), {
			checkOrigin: true,
			headers,
		});

		expect(gate).toEqual({ ok: true, admin: { customerId: 'cust-gate-3', email: 'boss-gate3@example.com' } });
		expect(headers.get('Cache-Control')).toBe('private, no-store');
	});

	it('sets no header when the gate refuses', async () => {
		const headers = new Headers();

		await gateAdmin(post(null, null), withAdmins('boss@example.com'), { headers });

		expect(headers.get('Cache-Control')).toBeNull();
	});
});

describe('landingPathAfterLogin', () => {
	it('sends an admin with no purchases to /admin, where /conta would bounce them back to /login', async () => {
		await seedCustomerRow('cust-land-1', 'lonely-admin@example.com');

		expect(await landingPathAfterLogin(withAdmins('lonely-admin@example.com'), 'cust-land-1')).toBe('/admin');
	});

	it('keeps a Cliente who is also an admin on /conta', async () => {
		await seedCustomerRow('cust-land-2', 'buyer-admin@example.com');
		await seedPurchase('cust-land-2');

		expect(await landingPathAfterLogin(withAdmins('buyer-admin@example.com'), 'cust-land-2')).toBe('/conta');
	});

	it('sends everyone else to /conta', async () => {
		await seedCustomerRow('cust-land-3', 'plain@example.com');

		expect(await landingPathAfterLogin(withAdmins('boss@example.com'), 'cust-land-3')).toBe('/conta');
	});
});
