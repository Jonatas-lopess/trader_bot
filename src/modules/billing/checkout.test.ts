import { env } from 'cloudflare:workers';
import { seedCustomer as attachCustomer } from '../../../test/customer-seed';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../pages/checkout';
import { createCheckoutSession } from './checkout';

const origin = 'https://example.com';

type AppmaxRequestBody = {
	amount: number;
	payment_methods: string[];
	recurring: boolean;
	metadata: { robot_id: string; offer: string };
};

// Only the outbound fetch to Appmax is mocked (spec.md's Testing
// Decisions) — the D1 write below runs against the real binding from
// ticket 01.
function mockAppmax(response: { ok: true; orderId: string } | { ok: false }) {
	const bodies: AppmaxRequestBody[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/payment-links')) {
			bodies.push(JSON.parse(init!.body as string));
			if (!response.ok) return new Response('unavailable', { status: 503 });
			return new Response(
				JSON.stringify({
					data: { url: 'https://checkout.sandboxappmax.com.br/pay/abc', order_id: response.orderId },
				}),
				{ status: 200 }
			);
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	return bodies;
}

function mockStripe(sessionId: string) {
	const bodies: URLSearchParams[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url === 'https://api.stripe.com/v1/checkout/sessions') {
			bodies.push(new URLSearchParams(init!.body as string));
			return new Response(
				JSON.stringify({ id: sessionId, url: `https://checkout.stripe.com/pay/${sessionId}` }),
				{ status: 200 }
			);
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	return bodies;
}

describe('createCheckoutSession', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		['unknown robot', 'no-such-robot', 'one_time'],
		['missing robot', null, 'one_time'],
		['unknown offer', 'robo-exemplo-a', 'lifetime'],
		['missing offer', 'robo-exemplo-a', null],
		['offer the robot does not sell', 'robo-exemplo-b', 'annual'],
		['robot with no offers (coming soon)', 'robo-exemplo-c', 'one_time'],
		['inherited object key as offer', 'robo-exemplo-a', 'constructor'],
	])('rejects %s without calling the gateway or writing a row', async (_label, robotId, offer) => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await createCheckoutSession(env, { robotId, offer, origin });

		expect(result).toEqual({ ok: false, status: 400, message: 'Unknown or missing robot or offer.' });
		expect(fetchSpy).not.toHaveBeenCalled();
		const row = await env.DB.prepare('SELECT 1 FROM purchases WHERE robot_id = ?')
			.bind(robotId ?? '')
			.first();
		expect(row).toBeNull();
	});

	it('writes a pending purchase priced from the catalog and redirects to Appmax', async () => {
		mockAppmax({ ok: true, orderId: 'ord_123' });

		const result = await createCheckoutSession(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });

		expect(result).toEqual({ ok: true, redirectUrl: 'https://checkout.sandboxappmax.com.br/pay/abc' });
		const row = await env.DB.prepare('SELECT * FROM purchases WHERE appmax_order_id = ?')
			.bind('ord_123')
			.first();
		expect(row).toMatchObject({
			robot_id: 'robo-exemplo-a',
			offer: 'one_time',
			amount_cents: 99700,
			status: 'pending',
			provider: 'appmax',
		});
	});

	it('ignores a client-supplied price: only the catalog amount is charged and stored', async () => {
		const bodies = mockAppmax({ ok: true, orderId: 'ord_tampered' });

		// The typed API takes no price; a tampered caller can only smuggle extra properties.
		const tampered = { robotId: 'robo-exemplo-a', offer: 'one_time', origin, amountCents: 1, amount: 1 };
		await createCheckoutSession(env, tampered);

		expect(bodies[0].amount).toBe(99700);
		const row = await env.DB.prepare('SELECT amount_cents FROM purchases WHERE appmax_order_id = ?')
			.bind('ord_tampered')
			.first();
		expect(row).toEqual({ amount_cents: 99700 });
	});

	it('the /checkout route ignores an amount query param', async () => {
		const bodies = mockAppmax({ ok: true, orderId: 'ord_route' });
		const url = new URL('https://example.com/checkout?robot=robo-exemplo-a&offer=annual&amount=1&price=1');

		const response = await GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);

		expect(response.status).toBe(302);
		expect(bodies[0].amount).toBe(49700);
	});

	it('the /checkout route returns 400 for an unknown robot', async () => {
		const url = new URL('https://example.com/checkout?robot=nope&offer=annual');
		const response = await GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);
		expect(response.status).toBe(400);
	});

	it.each([
		['one_time', ['card', 'boleto', 'pix'], false, 99700],
		['annual', ['card', 'boleto', 'pix'], false, 49700],
		['monthly', ['card'], true, 9700],
	])('Appmax: %s offers %j, recurring=%s', async (offer, methods, recurring, amount) => {
		const bodies = mockAppmax({ ok: true, orderId: `ord_${offer}` });

		await createCheckoutSession(env, { robotId: 'robo-exemplo-a', offer, origin });

		expect(bodies[0]).toMatchObject({
			amount,
			payment_methods: methods,
			recurring,
			metadata: { robot_id: 'robo-exemplo-a', offer },
		});
	});

	it('returns 502 and writes no row when Appmax is unavailable', async () => {
		mockAppmax({ ok: false });

		const result = await createCheckoutSession(env, { robotId: 'robo-exemplo-b', offer: 'one_time', origin });

		expect(result).toEqual({
			ok: false,
			status: 502,
			message: 'Payment provider unavailable, try again shortly.',
		});
		const row = await env.DB.prepare('SELECT * FROM purchases WHERE robot_id = ?')
			.bind('robo-exemplo-b')
			.first();
		expect(row).toBeNull();
	});

	describe('with PAYMENT_PROVIDER=stripe (docs/adr/0005-stripe-test-driver.md)', () => {
		const stripeEnv = { ...env, PAYMENT_PROVIDER: 'stripe' as const };

		it('one_time is a single payment, card only', async () => {
			const bodies = mockStripe('cs_stripe_one_time');

			const result = await createCheckoutSession(stripeEnv, {
				robotId: 'robo-exemplo-a',
				offer: 'one_time',
				origin,
			});

			expect(result).toEqual({ ok: true, redirectUrl: 'https://checkout.stripe.com/pay/cs_stripe_one_time' });
			expect(bodies[0].get('mode')).toBe('payment');
			expect(bodies[0].get('line_items[0][price_data][unit_amount]')).toBe('99700');
			expect(bodies[0].get('line_items[0][price_data][recurring][interval]')).toBeNull();
			expect(bodies[0].getAll('payment_method_types[]')).toEqual(['card']);
			const row = await env.DB.prepare('SELECT * FROM purchases WHERE appmax_order_id = ?')
				.bind('cs_stripe_one_time')
				.first();
			expect(row).toMatchObject({
				robot_id: 'robo-exemplo-a',
				offer: 'one_time',
				amount_cents: 99700,
				status: 'pending',
				provider: 'stripe',
			});
		});

		it('annual is a single payment', async () => {
			const bodies = mockStripe('cs_stripe_annual');
			await createCheckoutSession(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'annual', origin });
			expect(bodies[0].get('mode')).toBe('payment');
			expect(bodies[0].get('line_items[0][price_data][unit_amount]')).toBe('49700');
		});

		it('monthly is a monthly subscription, card only', async () => {
			const bodies = mockStripe('cs_stripe_monthly');
			await createCheckoutSession(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'monthly', origin });
			expect(bodies[0].get('mode')).toBe('subscription');
			expect(bodies[0].get('line_items[0][price_data][recurring][interval]')).toBe('month');
			expect(bodies[0].getAll('payment_method_types[]')).toEqual(['card']);
			expect(bodies[0].get('line_items[0][price_data][unit_amount]')).toBe('9700');
		});
	});

	describe('duplicate-Licença guard for an identified Cliente', () => {
		async function seedCustomer(params: { purchaseId: string; email: string; status: string; robotId: string }) {
			await env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'one_time', 99700, ?)"
			)
				.bind(params.purchaseId, params.robotId, params.status)
				.run();
			// Customers are keyed by email: a second purchase by the same email reuses the first id.
			await attachCustomer({ purchaseId: params.purchaseId, customerId: `cust-${params.purchaseId}`, email: params.email });
			const row = await env.DB.prepare('SELECT customer_id FROM purchases WHERE id = ?')
				.bind(params.purchaseId)
				.first<{ customer_id: string }>();
			return row!.customer_id;
		}

		it('blocks a second checkout for a Robô the Cliente already has active', async () => {
			const customerId = await seedCustomer({
				purchaseId: 'dup-active',
				email: 'dup@example.com',
				status: 'active',
				robotId: 'robo-exemplo-a',
			});
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			const result = await createCheckoutSession(env, {
				robotId: 'robo-exemplo-a',
				offer: 'annual',
				origin,
				customerId,
			});

			expect(result).toMatchObject({ ok: false, status: 409 });
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('allows a different Robô', async () => {
			const customerId = await seedCustomer({
				purchaseId: 'dup-other-robot',
				email: 'other@example.com',
				status: 'active',
				robotId: 'robo-exemplo-a',
			});
			mockAppmax({ ok: true, orderId: 'ord_other_robot' });

			const result = await createCheckoutSession(env, {
				robotId: 'robo-exemplo-b',
				offer: 'one_time',
				origin,
				customerId,
			});

			expect(result.ok).toBe(true);
		});

		it('a pending (abandoned or declined) purchase never blocks a new checkout', async () => {
			const customerId = await seedCustomer({
				purchaseId: 'dup-pending',
				email: 'pending@example.com',
				status: 'pending',
				robotId: 'robo-exemplo-a',
			});
			mockAppmax({ ok: true, orderId: 'ord_after_pending' });

			const result = await createCheckoutSession(env, {
				robotId: 'robo-exemplo-a',
				offer: 'one_time',
				origin,
				customerId,
			});

			expect(result.ok).toBe(true);
		});

		it('a guest checkout (no session) is not blocked here', async () => {
			mockAppmax({ ok: true, orderId: 'ord_guest' });
			const result = await createCheckoutSession(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });
			expect(result.ok).toBe(true);
		});
	});
});
