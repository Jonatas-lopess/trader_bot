import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { resolveCheckout } from './checkout';
import { getPurchaseStatus } from './status';
import { handleWebhook } from './webhook';

/**
 * .scratch/checkout-webhooks/issues/07-end-to-end-verification.md: the
 * remaining spec.md Testing Decisions matrix, run against the assembled
 * modules together rather than each in isolation. Only Appmax's `fetch` is
 * mocked (spec.md's Testing Decisions); every D1 read/write is real.
 */

/**
 * The own-form checkout (ADR-0007) renders the form and writes no row; the pay endpoint
 * writes it with `id = reference` and the Appmax order id. Set up directly here.
 */
async function startCheckout(orderId: string): Promise<string> {
	const checkout = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin: 'https://example.com' });
	if (checkout.kind !== 'form') throw new Error('expected the own checkout form');
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, ?, ?, 'pending', 'appmax', ?)"
	)
		.bind(checkout.reference, checkout.robotId, checkout.offer, checkout.amountCents, orderId)
		.run();
	return checkout.reference;
}

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
	beforeEach(async () => {
		await clearCatalog();
		await seedRobot({ slug: 'robo-exemplo-a', offers: { one_time: 99700 } });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: /checkout creates a provisional row, a webhook confirms it, the status endpoint reflects active', async () => {
		mockAppmaxAuth((url) => {
			if (url.includes('/orders/ord_e2e_happy')) {
				return new Response(JSON.stringify({ data: { order: { status: 'aprovado' }, payment: { method: 'credit_card' } } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const reference = await startCheckout('ord_e2e_happy');
		expect(await getPurchaseStatus(env, reference)).toEqual({ ok: true, state: 'pending' });

		const webhook = await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_e2e_happy' }));
		expect(webhook).toEqual({ status: 200 });

		expect(await getPurchaseStatus(env, reference)).toEqual({ ok: true, state: 'active' });
	});

	it('boleto branch: status shows the awaiting state before confirmation, then active after', async () => {
		mockAppmaxAuth((url) => {
			// Appmax's "boleto created" event: still pending, but payment_method is now known.
			if (url.includes('/orders/ord_e2e_boleto')) {
				return new Response(JSON.stringify({ data: { order: { status: 'pendente' }, payment: { method: 'boleto' } } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const reference = await startCheckout('ord_e2e_boleto');

		const created = await handleWebhook(env, JSON.stringify({ event: 'order_billet_created', order_id: 'ord_e2e_boleto' }));
		expect(created).toEqual({ status: 200 });
		expect(await getPurchaseStatus(env, reference)).toEqual({ ok: true, state: 'awaiting_boleto' });

		// Boleto confirms up to a business day later (CONTEXT.md) — a second,
		// distinct event re-fetches and finds it's now paid.
		vi.restoreAllMocks();
		mockAppmaxAuth((url) => {
			if (url.includes('/orders/ord_e2e_boleto')) {
				return new Response(JSON.stringify({ data: { order: { status: 'aprovado' }, payment: { method: 'boleto' } } }), {
					status: 200,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		const paid = await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_e2e_boleto' }));
		expect(paid).toEqual({ status: 200 });
		expect(await getPurchaseStatus(env, reference)).toEqual({ ok: true, state: 'active' });
	});

	it('concurrent delivery of two events for the same subscription resolves deterministically, no lost update', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, 'monthly', 0, ?, ?, ?)"
		)
			.bind('sub-e2e-concurrent', 'pro', 'pending', 'ord_concurrent', 'sub_concurrent')
			.run();

		mockAppmaxAuth((url) => {
			// Two distinct authoritative facts, reached via the two different ids
			// the same row carries — this is what lets one mock deterministically
			// answer both concurrent deliveries differently, the way Appmax's own
			// API would for an order-scoped vs. subscription-scoped query.
			if (url.includes('/orders/ord_concurrent')) {
				return new Response(JSON.stringify({ data: { order: { status: 'aprovado' } } }), { status: 200 });
			}
			if (url.includes('/subscriptions/sub_concurrent')) {
				return new Response(JSON.stringify({ data: { status: 'CANCELLED' } }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const eventActive = handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: 'ord_concurrent' }));
		const eventCanceled = handleWebhook(
			env,
			JSON.stringify({ event: 'subscription_cancelled', subscription_id: 'sub_concurrent', order_id: 'ord_concurrent' })
		);
		const [resultActive, resultCanceled] = await Promise.all([eventActive, eventCanceled]);

		expect(resultActive).toEqual({ status: 200 });
		expect(resultCanceled).toEqual({ status: 200 });

		// `canceled` outranks `active` (webhook.ts's STATUS_RIGIDITY) — the
		// compare-and-swap UPDATE guarantees this regardless of which of the
		// two concurrent requests' writes actually lands first at D1.
		const row = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?')
			.bind('sub-e2e-concurrent')
			.first<{ status: string }>();
		expect(row?.status).toBe('canceled');
	});
});
