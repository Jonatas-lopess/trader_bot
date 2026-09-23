import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession, isSessionValid, requireSession, revokeSession, verifySessionCookie } from './session';

describe('session', () => {
	// verifySessionCookie's signature takes no D1 binding at all (cookie
	// value + secret only) — structurally incapable of a DB round-trip,
	// matching spec.md's "no DB round-trip" hybrid design for ordinary page
	// loads. This test proves it still verifies correctly under that
	// constraint.
	it('creates a session whose cookie verifies with no D1 binding available', async () => {
		const { cookieValue } = await createSession(env, 'cust-session-1');

		const result = await verifySessionCookie(cookieValue, env.SESSION_SECRET);
		expect(result).toMatchObject({ ok: true, customerId: 'cust-session-1' });
	});

	it('rejects a tampered cookie signature', async () => {
		const { cookieValue } = await createSession(env, 'cust-session-2');
		const tampered = cookieValue.slice(0, -4) + 'xxxx';

		const result = await verifySessionCookie(tampered, env.SESSION_SECRET);
		expect(result).toEqual({ ok: false });
	});

	it('rejects a cookie signed with the wrong secret', async () => {
		const { cookieValue } = await createSession(env, 'cust-session-3');

		const result = await verifySessionCookie(cookieValue, 'wrong-secret');
		expect(result).toEqual({ ok: false });
	});

	it('revoking a session makes isSessionValid false without affecting the cookie signature', async () => {
		const { cookieValue } = await createSession(env, 'cust-session-4');
		const verified = await verifySessionCookie(cookieValue, env.SESSION_SECRET);
		if (!verified.ok) throw new Error('expected valid cookie');

		expect(await isSessionValid(env, verified.sessionId)).toBe(true);
		await revokeSession(env, verified.sessionId);
		expect(await isSessionValid(env, verified.sessionId)).toBe(false);

		// The cookie's own signature is still valid — revocation is a D1-side
		// check the caller (logout) must perform, not something that
		// invalidates the cookie's signature itself (User Story 7's point).
		const stillSignedOk = await verifySessionCookie(cookieValue, env.SESSION_SECRET);
		expect(stillSignedOk.ok).toBe(true);
	});

	it('requireSession reads the cookie header and rejects a request with none — the customer-area guard (User Story 13)', async () => {
		const { cookieValue } = await createSession(env, 'cust-session-5');

		const withCookie = new Request('https://example.com/conta', {
			headers: { Cookie: `session=${cookieValue}` },
		});
		expect(await requireSession(withCookie, env.SESSION_SECRET)).toMatchObject({
			ok: true,
			customerId: 'cust-session-5',
		});

		const withoutCookie = new Request('https://example.com/conta');
		expect(await requireSession(withoutCookie, env.SESSION_SECRET)).toEqual({ ok: false });
	});
});
