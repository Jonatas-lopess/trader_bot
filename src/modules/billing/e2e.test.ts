import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { resolveCheckout } from './checkout';
import { pay } from './pay';
import { getPurchaseStatus } from './status';
import { handleWebhook } from './webhook';

/**
 * .scratch/checkout-webhooks/issues/07-end-to-end-verification.md: the
 * remaining spec.md Testing Decisions matrix, run against the assembled
 * modules together rather than each in isolation. Only Appmax's `fetch` is
 * mocked (spec.md's Testing Decisions); every D1 read/write is real.
 */

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/**
 * The own-form checkout (ADR-0007): `/checkout` renders the form with a fresh reference, the
 * form posts to the pay endpoint, which writes the row and creates the Appmax order. Appmax's
 * customer/order/payment answers are layered over the test's own `fetch` mock for the call.
 */
async function startCheckout(orderId: string, method: 'card' | 'boleto'): Promise<string> {
	const checkout = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin: 'https://example.com' });
	if (checkout.kind !== 'form') throw new Error('expected the own checkout form');

	const fetchMock = vi.mocked(globalThis.fetch);
	const outer = fetchMock.getMockImplementation();
	if (outer === undefined) throw new Error('mock Appmax before starting a checkout');
	fetchMock.mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.endsWith('/v1/customers')) return json({ data: { customer: { id: 'cus_e2e' } } });
		if (url.endsWith('/v1/orders')) return json({ data: { order: { id: orderId, status: 'pendente' } } });
		if (url.endsWith('/v1/payments/credit-card')) return json({ data: { order: { id: orderId, status: 'autorizado' } } });
		if (url.endsWith('/v1/payments/boleto')) {
			return json({ data: { boleto: { pdf_url: 'https://boleto.example/b.pdf', digitable_line: '3419', due_date: '2099-12-31' } } });
		}
		return outer(input, init);
	});
	const paid = await pay(
		{ ...env, PAY_RATE_LIMITER: { limit: async () => ({ success: true }) } },
		{
			body: {
				reference: checkout.reference,
				robot: checkout.lines[0].robotId,
				offer: checkout.lines[0].offer,
				method,
				buyer: { name: 'Maria Silva', email: 'maria@example.com', phone: '11987654321', document: '12345678909' },
				...(method === 'card' ? { token: 'tok_e2e' } : {}),
			},
			ip: '203.0.113.9',
		}
	);
	fetchMock.mockImplementation(outer);
	expect(paid).toEqual({ ok: true, redirectUrl: `/checkout/confirmacao?ref=${checkout.reference}` });
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

		const reference = await startCheckout('ord_e2e_happy', 'card');
		expect(await getPurchaseStatus(env, reference)).toEqual({ ok: true, state: 'card_in_review' });

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

		const reference = await startCheckout('ord_e2e_boleto', 'boleto');

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
