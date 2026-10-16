import { env } from 'cloudflare:workers';
import { seedCustomer as attachCustomer } from '../../../test/customer-seed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { cartCheckoutHref } from '../../shared/cart-limits';
import { readCheckoutQuery, resolveCheckout } from './checkout';

const origin = 'https://example.com';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

async function purchaseCount(robotId: string): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases WHERE robot_id = ?').bind(robotId).first<{ n: number }>();
	return row?.n ?? 0;
}

describe('resolveCheckout', () => {
	beforeEach(async () => {
		await clearCatalog();
		await seedRobot({ slug: 'robo-exemplo-a', offers: { one_time: 99700, annual: 49700 } });
		await seedRobot({ slug: 'robo-exemplo-b', offers: { one_time: 149700 } });
		await seedRobot({ slug: 'robo-exemplo-c', status: 'coming-soon' });
		await seedRobot({ slug: 'robo-draft', status: 'draft', offers: { one_time: 99700 } });
		await seedRobot({ slug: 'robo-archived', status: 'archived', offers: { one_time: 99700 } });
	});

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
		['draft robot', 'robo-draft', 'one_time'],
		['archived robot', 'robo-archived', 'one_time'],
		['monthly offer of an unknown robot', 'no-such-robot', 'monthly'],
	])('rejects %s with 400, without calling a gateway or writing a row', async (_label, robotId, offer) => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await resolveCheckout(env, { robotId, offer, origin });

		expect(result).toEqual({ kind: 'error', status: 400, message: 'Unknown or missing robot or offer.' });
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await purchaseCount(robotId ?? '')).toBe(0);
	});

	describe('Appmax (own form, ADR-0007)', () => {
		it.each([
			['one_time', 99700],
			['annual', 49700],
		])('%s returns the form data priced from the catalog and writes no row', async (offer, amountCents) => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			const result = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer, origin });

			expect(result).toMatchObject({
				kind: 'form',
				lines: [{ robotId: 'robo-exemplo-a', robotName: 'Robô robo-exemplo-a', offer, quantity: 1, unitCents: amountCents }],
				amountCents,
				methods: ['card', 'boleto', 'pix'],
				fromCart: false,
			});
			if (result.kind !== 'form') throw new Error('expected the form');
			expect(result.reference).toMatch(UUID);
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(await purchaseCount('robo-exemplo-a')).toBe(0);
		});

		it('mints a fresh reference per render', async () => {
			const first = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });
			const second = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });
			if (first.kind !== 'form' || second.kind !== 'form') throw new Error('expected the form');
			expect(first.reference).not.toBe(second.reference);
		});

		it('prices from D1 at render time: an edited price is the one shown', async () => {
			await env.DB.prepare("UPDATE robot_offers SET price_cents = 88800 WHERE robot_slug = 'robo-exemplo-a' AND offer = 'one_time'").run();

			const result = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });

			expect(result).toMatchObject({ kind: 'form', amountCents: 88800 });
		});

		it('ignores a client-supplied price: only the catalog amount reaches the form', async () => {
			// The typed API takes no price; a tampered caller can only smuggle extra properties.
			const tampered = { robotId: 'robo-exemplo-a', offer: 'one_time', origin, amountCents: 1, amount: 1 };

			const result = await resolveCheckout(env, tampered);

			expect(result).toMatchObject({ kind: 'form', amountCents: 99700 });
		});

		it('Mensal of a published Robô is unavailable until the own-form recurrence exists (ticket 09)', async () => {
			const result = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'monthly', origin });
			expect(result).toEqual({ kind: 'unavailable', reason: 'offer_not_supported' });
			expect(await purchaseCount('robo-exemplo-a')).toBe(0);
		});

		describe('a cart (storefront-v2 11)', () => {
			const cart = (...lines: [string, string, number][]) =>
				lines.map(([robotId, offer, quantity]) => ({ robotId, offer, quantity }) as { robotId: unknown; offer: unknown; quantity: unknown });

			it('prices every line from D1 and totals them; writes no row', async () => {
				const fetchSpy = vi.spyOn(globalThis, 'fetch');

				const result = await resolveCheckout(env, {
					robotId: null,
					offer: null,
					lines: cart(['robo-exemplo-a', 'one_time', 2], ['robo-exemplo-a', 'annual', 1], ['robo-exemplo-b', 'one_time', 1]),
					origin,
				});

				expect(result).toMatchObject({
					kind: 'form',
					lines: [
						{ robotId: 'robo-exemplo-a', robotName: 'Robô robo-exemplo-a', offer: 'one_time', quantity: 2, unitCents: 99700 },
						{ robotId: 'robo-exemplo-a', robotName: 'Robô robo-exemplo-a', offer: 'annual', quantity: 1, unitCents: 49700 },
						{ robotId: 'robo-exemplo-b', robotName: 'Robô robo-exemplo-b', offer: 'one_time', quantity: 1, unitCents: 149700 },
					],
					amountCents: 2 * 99700 + 49700 + 149700,
					methods: ['card', 'boleto', 'pix'],
					fromCart: true,
				});
				expect(fetchSpy).not.toHaveBeenCalled();
				expect(await purchaseCount('robo-exemplo-a')).toBe(0);
			});

			it.each([
				['a draft Robô', cart(['robo-exemplo-a', 'one_time', 1], ['robo-draft', 'one_time', 1])],
				['an offer the Robô does not sell', cart(['robo-exemplo-b', 'annual', 1])],
				['a quantity over the cap', cart(['robo-exemplo-a', 'one_time', 6])],
				['no lines', cart()],
			])('%s rejects the whole cart with 400', async (_label, lines) => {
				const result = await resolveCheckout(env, { robotId: null, offer: null, lines, origin });
				expect(result).toMatchObject({ kind: 'error', status: 400 });
			});

			it('a Mensal line is unavailable', async () => {
				const result = await resolveCheckout(env, {
					robotId: null,
					offer: null,
					lines: cart(['robo-exemplo-a', 'one_time', 1], ['robo-exemplo-a', 'monthly', 1]),
					origin,
				});
				expect(result).toEqual({ kind: 'unavailable', reason: 'offer_not_supported' });
			});
		});

		it('repeat purchase of a Robô the Cliente already has active still gets the form (ADR-0008)', async () => {
			await env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES ('rep-active', 'robo-exemplo-a', 'one_time', 99700, 'active')"
			).run();
			await attachCustomer({ purchaseId: 'rep-active', customerId: 'cust-rep-active', email: 'repeat@example.com' });

			const result = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });

			expect(result.kind).toBe('form');
		});
	});

	describe('with PAYMENT_PROVIDER=stripe (docs/adr/0005-stripe-test-driver.md)', () => {
		const stripeEnv = { ...env, PAYMENT_PROVIDER: 'stripe' as const };

		it('one_time is a single payment, card only, with a pending row and a redirect', async () => {
			const bodies = mockStripe('cs_stripe_one_time');

			const result = await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });

			expect(result).toEqual({ kind: 'redirect', redirectUrl: 'https://checkout.stripe.com/pay/cs_stripe_one_time' });
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
			await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'annual', origin });
			expect(bodies[0].get('mode')).toBe('payment');
			expect(bodies[0].get('line_items[0][price_data][unit_amount]')).toBe('49700');
		});

		it('the success URL carries the row reference to the confirmation page', async () => {
			const bodies = mockStripe('cs_stripe_return');
			await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'one_time', origin });
			const row = await env.DB.prepare('SELECT id FROM purchases WHERE appmax_order_id = ?')
				.bind('cs_stripe_return')
				.first<{ id: string }>();
			expect(bodies[0].get('success_url')).toBe(`https://example.com/checkout/confirmacao?ref=${row!.id}`);
		});

		it('ignores a client-supplied price', async () => {
			const bodies = mockStripe('cs_stripe_tampered');
			await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'one_time', origin, amountCents: 1 } as never);
			expect(bodies[0].get('line_items[0][price_data][unit_amount]')).toBe('99700');
		});

		it('Mensal is not in the catalog (ADR-0008 standby): 400', async () => {
			const result = await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-a', offer: 'monthly', origin });
			expect(result).toMatchObject({ kind: 'error', status: 400 });
		});

		it('a cart of more than one Licença is unavailable: the test driver takes one item', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const lines = [{ robotId: 'robo-exemplo-a', offer: 'one_time', quantity: 2 }];

			const result = await resolveCheckout(stripeEnv, { robotId: null, offer: null, lines, origin });

			expect(result).toEqual({ kind: 'unavailable', reason: 'cart_not_supported' });
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('returns 502 and writes no row when Stripe is unavailable', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));

			const result = await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-b', offer: 'one_time', origin });

			expect(result).toEqual({ kind: 'error', status: 502, message: 'Payment provider unavailable, try again shortly.' });
			expect(await purchaseCount('robo-exemplo-b')).toBe(0);
		});

		it('two checkouts for the same Robô and Oferta yield two distinct pending purchases', async () => {
			mockStripe('cs_twin_1');
			await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-b', offer: 'one_time', origin });
			vi.restoreAllMocks();
			mockStripe('cs_twin_2');
			await resolveCheckout(stripeEnv, { robotId: 'robo-exemplo-b', offer: 'one_time', origin });

			const rows = await env.DB.prepare("SELECT id, status FROM purchases WHERE appmax_order_id IN ('cs_twin_1', 'cs_twin_2')").all<{ id: string; status: string }>();
			expect(rows.results).toHaveLength(2);
			expect(new Set(rows.results.map((row) => row.id)).size).toBe(2);
			expect(rows.results.every((row) => row.status === 'pending')).toBe(true);
		});
	});
});

describe('readCheckoutQuery', () => {
	it('reads only robot and offer from the URL; a price-like param is ignored (ADR-0006)', () => {
		const url = new URL('https://example.com/checkout?robot=robo-exemplo-a&offer=annual&amount=1&price=1&amountCents=1');
		expect(readCheckoutQuery(url)).toEqual({ robotId: 'robo-exemplo-a', offer: 'annual', lines: null, origin: 'https://example.com' });
	});

	it('passes missing params as null', () => {
		expect(readCheckoutQuery(new URL('https://example.com/checkout'))).toEqual({
			robotId: null,
			offer: null,
			lines: null,
			origin: 'https://example.com',
		});
	});

	it('reads a cart from repeated `line=<robot>:<offer>:<quantity>` params, never a price', () => {
		const url = new URL('https://example.com/checkout?line=robo-a:one_time:2&line=robo-b:annual:1&price=1');
		expect(readCheckoutQuery(url).lines).toEqual([
			{ robotId: 'robo-a', offer: 'one_time', quantity: 2 },
			{ robotId: 'robo-b', offer: 'annual', quantity: 1 },
		]);
	});

	it("reads back the cart page's checkout link (cartCheckoutHref)", () => {
		const href = cartCheckoutHref([
			{ robot: 'robo-a', offer: 'one_time', quantity: 2 },
			{ robot: 'robo-b', offer: 'annual', quantity: 1 },
		]);
		expect(readCheckoutQuery(new URL(href, 'https://example.com')).lines).toEqual([
			{ robotId: 'robo-a', offer: 'one_time', quantity: 2 },
			{ robotId: 'robo-b', offer: 'annual', quantity: 1 },
		]);
	});

	it('keeps a malformed cart line for the pricing step to reject', () => {
		const url = new URL('https://example.com/checkout?line=robo-a:one_time:x&line=robo-b');
		expect(readCheckoutQuery(url).lines).toEqual([
			{ robotId: 'robo-a', offer: 'one_time', quantity: Number.NaN },
			{ robotId: 'robo-b', offer: null, quantity: Number.NaN },
		]);
	});
});
