import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscription } from '../billing/cancel';
import { handleWebhook } from '../billing/webhook';
import { resolveAccountView } from '../licensing/account-page';
import { redeemMagicLink, requestMagicLink } from './magic-link';
import { isSessionValid, revokeSession, verifySessionCookie } from './session';

/**
 * .scratch/customer-area/issues/05-end-to-end-verification.md — the
 * login-to-cancel happy path, plus the two negative cases the ticket calls
 * out, run against the assembled modules together rather than each in
 * isolation.
 *
 * This repo's "Playwright" wording (spec.md, PLANNING.md §5) has never meant
 * real browser automation: no Playwright dependency exists anywhere in this
 * repo (`package.json`, config files) despite the word appearing in prose.
 * `checkout-webhooks` ticket 07 resolved the exact same wording as a vitest
 * integration test (`src/modules/billing/e2e.test.ts`) calling the real
 * module functions against real D1, with only the outbound provider `fetch`
 * mocked. This file follows that precedent — Appmax's and Resend's `fetch`
 * are the two seams mocked; every D1 read/write is real.
 */

function mockOutboundFetch(appmaxHandler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'e2e-identity-token' }), { status: 200 });
		}
		if (url.includes('api.resend.com')) {
			return new Response(JSON.stringify({ id: 'resend-e2e' }), { status: 200 });
		}
		return appmaxHandler(url, init);
	});
}

async function seedPendingSubscription(params: {
	id: string;
	appmaxOrderId: string;
	appmaxSubscriptionId: string;
	planId?: string;
}): Promise<void> {
	await env.DB.prepare(
		'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, ?, ?)'
	)
		.bind(params.id, params.planId ?? 'pro', 'pending', params.appmaxOrderId, params.appmaxSubscriptionId)
		.run();
}

async function latestTokenFor(customerEmail: string): Promise<string> {
	const row = await env.DB.prepare(
		`SELECT lt.token AS token FROM login_tokens lt
		 JOIN customers c ON c.id = lt.customer_id
		 WHERE c.email = ?
		 ORDER BY lt.created_at DESC LIMIT 1`
	)
		.bind(customerEmail)
		.first<{ token: string }>();
	if (row === null) throw new Error(`no login token found for ${customerEmail}`);
	return row.token;
}

function requestWithSessionCookie(cookieValue: string): Request {
	return new Request('https://example.com/conta', { headers: { Cookie: `session=${cookieValue}` } });
}

describe('customer-area end to end: login to cancel', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: webhook confirms → customers row exists → login → /conta shows plano+licença → cancel flips status', async () => {
		await seedPendingSubscription({
			id: 'sub-e2e-happy',
			appmaxOrderId: 'ord_e2e_happy',
			appmaxSubscriptionId: 'asub_e2e_happy',
			planId: 'pro',
		});
		mockOutboundFetch((url) => {
			if (url.includes('/orders/ord_e2e_happy')) {
				return new Response(
					JSON.stringify({ data: { status: 'aprovado', payment_method: 'cartao', email: 'cliente@example.com' } }),
					{ status: 200 }
				);
			}
			if (url.includes('/subscriptions/asub_e2e_happy/cancel')) {
				return new Response(null, { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		// 1. Webhook confirms the subscription, provisioning `customers`
		// (ticket 01) from the same authoritative re-fetch.
		const webhookResult = await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_e2e_happy' }));
		expect(webhookResult).toEqual({ status: 200 });
		const customer = await env.DB.prepare('SELECT id FROM customers WHERE subscription_id = ?')
			.bind('sub-e2e-happy')
			.first<{ id: string }>();
		expect(customer).not.toBeNull();

		// 2. Request + redeem a magic link (ticket 02).
		await requestMagicLink(env, { email: 'cliente@example.com', ip: '203.0.113.10', origin: 'https://example.com' });
		const token = await latestTokenFor('cliente@example.com');
		const redeemed = await redeemMagicLink(env, token);
		expect(redeemed.ok).toBe(true);
		if (!redeemed.ok) throw new Error('expected redeem to succeed');

		// 3. The customer area resolves Plano + Licença from the session cookie
		// alone (ticket 03) — no `licenses` row seeded, so it's "preparing".
		const accountRequest = requestWithSessionCookie(redeemed.cookieValue);
		const view = await resolveAccountView(env, accountRequest);
		expect(view).toMatchObject({
			ok: true,
			planName: 'Pro',
			license: { status: 'preparing', expiresAt: null },
			subscriptionStatus: 'active',
		});

		// 4. Cancel (ticket 04) — Appmax call + CAS `UPDATE`, no touch to `licenses`.
		const cancelResult = await cancelSubscription(env, {
			subscriptionId: 'sub-e2e-happy',
			provider: 'appmax',
			providerSubscriptionId: 'asub_e2e_happy',
		});
		expect(cancelResult).toEqual({ ok: true });

		// 5. The page reflects the new status.
		const viewAfterCancel = await resolveAccountView(env, requestWithSessionCookie(redeemed.cookieValue));
		expect(viewAfterCancel).toMatchObject({ ok: true, subscriptionStatus: 'canceled' });
	});

	it('an already-used token and a separately-issued expired token are both rejected end to end', async () => {
		await seedPendingSubscription({
			id: 'sub-e2e-token',
			appmaxOrderId: 'ord_e2e_token',
			appmaxSubscriptionId: 'asub_e2e_token',
		});
		mockOutboundFetch((url) => {
			if (url.includes('/orders/ord_e2e_token')) {
				return new Response(
					JSON.stringify({ data: { status: 'aprovado', email: 'tokens@example.com' } }),
					{ status: 200 }
				);
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_e2e_token' }));

		// Replay: redeeming the same token twice — the second attempt fails.
		await requestMagicLink(env, { email: 'tokens@example.com', ip: '203.0.113.11', origin: 'https://example.com' });
		const firstToken = await latestTokenFor('tokens@example.com');
		const firstRedeem = await redeemMagicLink(env, firstToken);
		expect(firstRedeem.ok).toBe(true);
		const replay = await redeemMagicLink(env, firstToken);
		expect(replay).toEqual({ ok: false });

		// A second, separately-issued token that's already expired by the time
		// it's redeemed — exercised through the same request→redeem cycle, not
		// hand-inserted, to prove expiry holds up across two real issuances for
		// the same customer.
		await requestMagicLink(env, { email: 'tokens@example.com', ip: '203.0.113.11', origin: 'https://example.com' });
		const secondToken = await latestTokenFor('tokens@example.com');
		await env.DB.prepare('UPDATE login_tokens SET expires_at = ? WHERE token = ?')
			.bind(new Date(Date.now() - 1000).toISOString(), secondToken)
			.run();
		const expiredRedeem = await redeemMagicLink(env, secondToken);
		expect(expiredRedeem).toEqual({ ok: false });
	});

	it('logging out revokes the session store even though the cookie signature stays valid — the guard sensitive actions rely on', async () => {
		await seedPendingSubscription({
			id: 'sub-e2e-logout',
			appmaxOrderId: 'ord_e2e_logout',
			appmaxSubscriptionId: 'asub_e2e_logout',
		});
		mockOutboundFetch((url) => {
			if (url.includes('/orders/ord_e2e_logout')) {
				return new Response(JSON.stringify({ data: { status: 'aprovado', email: 'logout@example.com' } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_e2e_logout' }));
		await requestMagicLink(env, { email: 'logout@example.com', ip: '203.0.113.12', origin: 'https://example.com' });
		const token = await latestTokenFor('logout@example.com');
		const redeemed = await redeemMagicLink(env, token);
		expect(redeemed.ok).toBe(true);
		if (!redeemed.ok) throw new Error('expected redeem to succeed');

		// Ordinary page loads (`resolveAccountView` → `requireSession`) are
		// cookie-only by design (spec.md's hybrid session model) — the old
		// cookie's signature is unaffected by logout, so this call correctly
		// still succeeds. That is not a gap: `/conta/cancelar` is the one
		// write path in this scope that re-checks `isSessionValid` (ticket 04)
		// before doing anything, exactly like `/logout` itself does the
		// revocation. The assertions below demonstrate revocation actually
		// taking effect at the layer this repo's design puts it — the
		// `sessions` table — which is what the sensitive actions consult.
		const verified = await verifySessionCookie(redeemed.cookieValue, env.SESSION_SECRET);
		if (!verified.ok) throw new Error('expected cookie to verify');
		expect(await isSessionValid(env, verified.sessionId)).toBe(true);

		await revokeSession(env, verified.sessionId);

		expect(await isSessionValid(env, verified.sessionId)).toBe(false);
		// The cookie itself is still cryptographically valid — proving the
		// old cookie's signature alone would not have been enough to block
		// reuse, which is exactly why `/conta/cancelar` re-checks `sessions`
		// (src/pages/conta/cancelar.ts) instead of trusting `requireSession`
		// alone for that one sensitive action.
		const stillSignedOk = await resolveAccountView(env, requestWithSessionCookie(redeemed.cookieValue));
		expect(stillSignedOk.ok).toBe(true);
	});
});
