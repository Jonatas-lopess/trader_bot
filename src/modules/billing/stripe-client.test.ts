import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscription, createCheckoutSession, fetchAuthoritativeStatus, stripeProvider } from './stripe-client';

const env = { STRIPE_SECRET_KEY: 'sk_test_dummy' };

// The `stripeProvider` adapter tests below go through the shared
// `IPaymentProvider` type, which accepts either gateway's credentials
// (payment-provider.ts's `PaymentProviderEnv`) — Appmax's two fields are
// unused by the Stripe driver but still required by the type.
const providerEnv = { ...env, APPMAX_CLIENT_ID: 'unused', APPMAX_CLIENT_SECRET: 'unused' };

describe('createCheckoutSession', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns the checkout url and session id on success', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
			return new Response(JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' }), {
				status: 200,
			});
		});

		const result = await createCheckoutSession(env, {
			reference: 'ref-1',
			planId: 'starter',
			amountCents: 4990,
			returnUrl: 'https://example.com/checkout/confirmacao?ref=ref-1',
			cancelUrl: 'https://example.com/checkout/confirmacao?ref=ref-1',
		});

		expect(result).toEqual({
			ok: true,
			checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_123',
			sessionId: 'cs_test_123',
		});
	});

	it('returns stripe_auth_failed on a 401', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

		const result = await createCheckoutSession(env, {
			reference: 'ref-2',
			planId: 'pro',
			amountCents: 9990,
			returnUrl: 'https://example.com/x',
			cancelUrl: 'https://example.com/x',
		});

		expect(result).toEqual({ ok: false, reason: 'stripe_auth_failed' });
	});

	it('returns stripe_unavailable when Stripe is unreachable', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

		const result = await createCheckoutSession(env, {
			reference: 'ref-3',
			planId: 'pro',
			amountCents: 9990,
			returnUrl: 'https://example.com/x',
			cancelUrl: 'https://example.com/x',
		});

		expect(result).toEqual({ ok: false, reason: 'stripe_unavailable' });
	});
});

describe('fetchAuthoritativeStatus', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves an active subscription by subscriptionId, expanding the customer for their email', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_123?expand[]=customer');
			return new Response(
				JSON.stringify({ status: 'active', customer: { email: 'buyer@example.com' } }),
				{ status: 200 }
			);
		});

		const result = await fetchAuthoritativeStatus(env, { orderId: null, subscriptionId: 'sub_123' });

		expect(result).toEqual({ ok: true, status: 'active', paymentMethod: 'card', email: 'buyer@example.com' });
	});

	it('resolves email as null when the customer is unexpanded (an id string, not an object)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ status: 'active', customer: 'cus_123' }), { status: 200 })
		);

		const result = await fetchAuthoritativeStatus(env, { orderId: null, subscriptionId: 'sub_123' });

		expect(result).toEqual({ ok: true, status: 'active', paymentMethod: 'card', email: null });
	});

	it('resolves a checkout session that has not completed yet as pending', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					status: 'open',
					payment_status: 'unpaid',
					subscription: null,
					customer_details: null,
				}),
				{ status: 200 }
			)
		);

		const result = await fetchAuthoritativeStatus(env, { orderId: 'cs_123', subscriptionId: null });

		expect(result).toEqual({ ok: true, status: 'pending', paymentMethod: null, email: null });
	});

	it('resolves a completed, paid checkout session as active with the buyer email', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					status: 'complete',
					payment_status: 'paid',
					subscription: 'sub_456',
					customer_details: { email: 'buyer@example.com' },
				}),
				{ status: 200 }
			)
		);

		const result = await fetchAuthoritativeStatus(env, { orderId: 'cs_456', subscriptionId: null });

		expect(result).toEqual({ ok: true, status: 'active', paymentMethod: 'card', email: 'buyer@example.com' });
	});

	it('returns ok:false when both ids are missing', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await fetchAuthoritativeStatus(env, { orderId: null, subscriptionId: null });

		expect(result).toEqual({ ok: false });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('cancelSubscription', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('DELETEs the subscription and reports ok on success', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = typeof input === 'string' ? input : input.toString();
			expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_789');
			expect(init?.method).toBe('DELETE');
			return new Response(JSON.stringify({ status: 'canceled' }), { status: 200 });
		});

		expect(await cancelSubscription(env, 'sub_789')).toEqual({ ok: true });
	});

	it('reports ok:false when Stripe rejects the cancel call', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

		expect(await cancelSubscription(env, 'sub_missing')).toEqual({ ok: false });
	});
});

describe('stripeProvider adapter', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('maps createCheckoutSession onto the shared IPaymentProvider shape', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ id: 'cs_adapter', url: 'https://checkout.stripe.com/pay/cs_adapter' }), {
				status: 200,
			})
		);

		const result = await stripeProvider.createCheckoutSession(providerEnv, {
			reference: 'ref-adapter',
			planId: 'starter',
			amountCents: 4990,
			returnUrl: 'https://example.com/x',
			cancelUrl: 'https://example.com/',
		});

		expect(result).toEqual({
			ok: true,
			checkoutUrl: 'https://checkout.stripe.com/pay/cs_adapter',
			providerOrderId: 'cs_adapter',
		});
	});

	it('maps a stripe_unavailable failure onto provider_unavailable', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));

		const result = await stripeProvider.createCheckoutSession(providerEnv, {
			reference: 'ref-fail',
			planId: 'starter',
			amountCents: 4990,
			returnUrl: 'https://example.com/x',
			cancelUrl: 'https://example.com/',
		});

		expect(result).toEqual({ ok: false, reason: 'provider_unavailable' });
	});
});
