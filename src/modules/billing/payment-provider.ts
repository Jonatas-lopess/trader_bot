/**
 * The payment-provider seam PLANNING.md §6 previously ruled out ("No
 * payment-provider interface ... Appmax is the committed gateway with no
 * swap planned"). Reopened as a stopgap, not a reversal of that commitment
 * — see docs/adr/0005-stripe-test-driver.md. Appmax's own account signup is
 * currently blocked, so a Stripe test-mode driver stands in for local/
 * manual checkout testing until Appmax onboarding completes. `factory.ts`
 * defaults to Appmax and only switches on an explicit
 * `PAYMENT_PROVIDER=stripe` — ADR-0003 still stands as the committed
 * production gateway.
 *
 * Scoped to exactly the two operations `checkout.ts` and `cancel.ts` need.
 * Deliberately excludes:
 *   - Webhook handling. Appmax and Stripe's trust models, payload shapes
 *     and signature schemes are too different to unify without faking a
 *     shared contract neither gateway actually has — each keeps its own
 *     webhook module and route (webhook.ts/webhook-hardening.ts for Appmax,
 *     stripe-webhook.ts for Stripe), same split as before this seam existed.
 *   - A billing-portal / plan-listing surface. Both gateways' own
 *     self-service portals are explicitly not used (PLANNING.md §6, "A
 *     customer self-service portal. Cancellation UI is ours.") — plans are
 *     `src/content/plans.ts`, not fetched from either provider.
 */

export type ProviderId = 'appmax' | 'stripe';

export type SubscriptionState = 'pending' | 'active' | 'past_due' | 'canceled';
export type PaymentMethod = 'card' | 'boleto' | 'pix';

export type CreateCheckoutSessionParams = {
	reference: string;
	planId: string;
	amountCents: number;
	returnUrl: string;
	/** Where an abandoned checkout goes back to. Appmax's hosted checkout has no such concept; Stripe's driver uses it as `cancel_url`, distinct from `returnUrl` so a cancelled checkout doesn't land on the same confirmation page a successful payer sees. */
	cancelUrl: string;
};

export type CreateCheckoutSessionResult =
	| { ok: true; checkoutUrl: string; providerOrderId: string | null }
	| { ok: false; reason: 'provider_auth_failed' | 'provider_unavailable' };

export type FetchAuthoritativeStatusResult =
	| { ok: true; status: SubscriptionState; paymentMethod: PaymentMethod | null; email: string | null }
	| { ok: false };

/** Exactly the credentials either driver needs — never the full `Cloudflare.Env`, so callers can pass their own narrower `Pick`. */
export type PaymentProviderEnv = Pick<
	Cloudflare.Env,
	'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY'
>;

/** `I` prefix per convention (projeto_ebd's own `IPaymentProvider`) — a polymorphic contract two concrete drivers implement, not a plain data shape. */
export type IPaymentProvider = {
	id: ProviderId;
	createCheckoutSession(
		env: PaymentProviderEnv,
		params: CreateCheckoutSessionParams
	): Promise<CreateCheckoutSessionResult>;
	fetchAuthoritativeStatus(
		env: PaymentProviderEnv,
		ref: { orderId: string | null; subscriptionId: string | null }
	): Promise<FetchAuthoritativeStatusResult>;
	cancelSubscription(env: PaymentProviderEnv, providerSubscriptionId: string): Promise<{ ok: true } | { ok: false }>;
};
