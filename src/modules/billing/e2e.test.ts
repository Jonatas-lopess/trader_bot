import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from './checkout';
import { getSubscriptionStatus } from './status';
import { handleWebhook } from './webhook';

/**
 * .scratch/checkout-webhooks/issues/07-end-to-end-verification.md: the
 * remaining spec.md Testing Decisions matrix, run against the assembled
 * modules together rather than each in isolation. Only Appmax's `fetch` is
 * mocked (spec.md's Testing Decisions); every D1 read/write is real.
 */

function mockAppmaxAuth(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'e2e-token' }), { status: 200 });
		}
		return handler(url, init);
	});
}

describe('checkout-webhooks end to end', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: /checkout creates a provisional row, a webhook confirms it, the status endpoint reflects active', async () => {
		let capturedReturnUrl = '';
		mockAppmaxAuth((url, init) => {
			if (url.includes('/payment-links')) {
				capturedReturnUrl = (JSON.parse(String(init?.body)) as { return_url: string }).return_url;
				return new Response(
					JSON.stringify({ data: { url: 'https://checkout.sandboxappmax.com.br/pay/e2e-happy', order_id: 'ord_e2e_happy' } }),
					{ status: 200 }
				);
			}
			if (url.includes('/orders/ord_e2e_happy')) {
				return new Response(JSON.stringify({ data: { status: 'aprovado', payment_method: 'cartao' } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const checkout = await createCheckoutSession(env, { planId: 'starter', origin: 'https://example.com' });
		expect(checkout.ok).toBe(true);

		const reference = new URL(capturedReturnUrl).searchParams.get('ref');
		expect(reference).not.toBeNull();
		expect(await getSubscriptionStatus(env, reference)).toEqual({ ok: true, state: 'pending' });

		const webhook = await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_e2e_happy' }));
		expect(webhook).toEqual({ status: 200 });

		expect(await getSubscriptionStatus(env, reference)).toEqual({ ok: true, state: 'active' });
	});

	it('boleto branch: status shows the awaiting state before confirmation, then active after', async () => {
		let capturedReturnUrl = '';
		mockAppmaxAuth((url, init) => {
			if (url.includes('/payment-links')) {
				capturedReturnUrl = (JSON.parse(String(init?.body)) as { return_url: string }).return_url;
				return new Response(
					JSON.stringify({ data: { url: 'https://checkout.sandboxappmax.com.br/pay/e2e-boleto', order_id: 'ord_e2e_boleto' } }),
					{ status: 200 }
				);
			}
			// Appmax's own "creation" event fires once the Cliente picks Boleto on
			// its hosted page — still pending, but payment_method is now known
			// (PLANNING.md §6: Appmax documents a creation event distinct from
			// the recurring-charge/paid one).
			if (url.includes('/orders/ord_e2e_boleto')) {
				return new Response(JSON.stringify({ data: { status: 'pendente', payment_method: 'boleto' } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const checkout = await createCheckoutSession(env, { planId: 'starter', origin: 'https://example.com' });
		expect(checkout.ok).toBe(true);
		const reference = new URL(capturedReturnUrl).searchParams.get('ref');

		const created = await handleWebhook(env, JSON.stringify({ event: 'order.created', order_id: 'ord_e2e_boleto' }));
		expect(created).toEqual({ status: 200 });
		expect(await getSubscriptionStatus(env, reference)).toEqual({ ok: true, state: 'awaiting_boleto' });

		// Boleto confirms up to a business day later (CONTEXT.md) — a second,
		// distinct event re-fetches and finds it's now paid.
		vi.restoreAllMocks();
		mockAppmaxAuth((url) => {
			if (url.includes('/orders/ord_e2e_boleto')) {
				return new Response(JSON.stringify({ data: { status: 'aprovado', payment_method: 'boleto' } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		const paid = await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_e2e_boleto' }));
		expect(paid).toEqual({ status: 200 });
		expect(await getSubscriptionStatus(env, reference)).toEqual({ ok: true, state: 'active' });
	});

	it('concurrent delivery of two events for the same subscription resolves deterministically, no lost update', async () => {
		await env.DB.prepare(
			'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, ?, ?)'
		)
			.bind('sub-e2e-concurrent', 'pro', 'pending', 'ord_concurrent', 'sub_concurrent')
			.run();

		mockAppmaxAuth((url) => {
			// Two distinct authoritative facts, reached via the two different ids
			// the same row carries — this is what lets one mock deterministically
			// answer both concurrent deliveries differently, the way Appmax's own
			// API would for an order-scoped vs. subscription-scoped query.
			if (url.includes('/orders/ord_concurrent')) {
				return new Response(JSON.stringify({ data: { status: 'aprovado' } }), { status: 200 });
			}
			if (url.includes('/subscriptions/sub_concurrent')) {
				return new Response(JSON.stringify({ data: { status: 'cancelado' } }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const eventActive = handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_concurrent' }));
		const eventCanceled = handleWebhook(
			env,
			JSON.stringify({ event: 'subscription.canceled', subscription_id: 'sub_concurrent', order_id: 'ord_concurrent' })
		);
		const [resultActive, resultCanceled] = await Promise.all([eventActive, eventCanceled]);

		expect(resultActive).toEqual({ status: 200 });
		expect(resultCanceled).toEqual({ status: 200 });

		// `canceled` outranks `active` (webhook.ts's STATUS_RIGIDITY) — the
		// compare-and-swap UPDATE guarantees this regardless of which of the
		// two concurrent requests' writes actually lands first at D1.
		const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE id = ?')
			.bind('sub-e2e-concurrent')
			.first<{ status: string }>();
		expect(row?.status).toBe('canceled');
	});
});
