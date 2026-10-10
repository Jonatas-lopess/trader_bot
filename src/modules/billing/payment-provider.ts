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
 *     customer self-service portal. Cancellation UI is ours.") — prices are
 *     `src/content/catalog.ts`, not fetched from either provider.
 */

import type { OfferName } from '../../content/catalog';

export type ProviderId = 'appmax' | 'stripe';

/** Ranked lowest to highest; `purchase-lookup.ts`'s `STATUS_RIGIDITY` and migrations/0008 must agree. `rejected` is set by the webhook amount check; the Appmax mapper reports `refunded` and `chargeback`. */
export type PurchaseStatus =
	| 'pending'
	| 'rejected'
	| 'active'
	| 'past_due'
	| 'canceled'
	| 'refunded'
	| 'chargeback';
export type PaymentMethod = 'card' | 'boleto' | 'pix';

/**
 * Methods each Oferta accepts (ADR-0006, PLANNING.md §6): Compra and Anual are a single
 * charge, so card/Boleto/Pix all work; Mensal is recurring, so card only. Checkout derives
 * this from the Oferta and hands it to the driver, which must not offer anything else.
 */
export function paymentMethodsFor(offer: OfferName): PaymentMethod[] {
	return offer === 'monthly' ? ['card'] : ['card', 'boleto', 'pix'];
}

export type CreateCheckoutSessionParams = {
	reference: string;
	robotId: string;
	offer: OfferName;
	/** Charged as one payment for `one_time`/`annual`, recurring monthly for `monthly`. */
	amountCents: number;
	/** From `paymentMethodsFor(offer)`; a driver that cannot honour a method (Stripe test driver: card only) offers the intersection. */
	allowedMethods: PaymentMethod[];
	returnUrl: string;
	/** Where an abandoned checkout goes back to. Appmax's hosted checkout has no such concept; Stripe's driver uses it as `cancel_url`, distinct from `returnUrl` so a cancelled checkout doesn't land on the same confirmation page a successful payer sees. */
	cancelUrl: string;
};

export type CreateCheckoutSessionResult =
	| { ok: true; checkoutUrl: string; providerOrderId: string | null }
	| { ok: false; reason: 'provider_auth_failed' | 'provider_unavailable' };

export type BuyerFiscalData = { name: string | null; document: string | null };

export type FetchAuthoritativeStatusResult =
	| {
			ok: true;
			status: PurchaseStatus;
			paymentMethod: PaymentMethod | null;
			email: string | null;
			/** From the authoritative refetch only, for the manual NFS-e (ticket 13). `document` is digits only (CPF 11 / CNPJ 14) or `null`. Personal data: never log. */
			buyer: BuyerFiscalData;
			/** What the gateway says was charged for the item, in cents, before installment fees. `null` when the response carries none; webhooks compare it to `purchases.amount_cents` (ADR-0006). */
			reportedAmountCents: number | null;
	  }
	| { ok: false };

/** Exactly the credentials either driver needs — never the full `Cloudflare.Env`, so callers can pass their own narrower `Pick`. */
export type PaymentProviderEnv = Pick<
	Cloudflare.Env,
	'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY'
> & {
	/** Appmax host selection (`appmax-client.ts`'s `appmaxHosts`): only `'production'` is production. */
	APPMAX_ENV?: string;
};

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

/** Strips a CPF/CNPJ to digits; anything that is not 11 (CPF) or 14 (CNPJ) digits is treated as absent rather than persisted into a nota. */
export function normalizeBuyerDocument(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	// Alphanumeric CNPJ (2026) has letters; stripping them could store a wrong number, so treat it as absent for manual entry.
	if (/[a-z]/i.test(raw)) return null;
	const digits = raw.replace(/\D/g, '');
	return digits.length === 11 || digits.length === 14 ? digits : null;
}

/** A trimmed non-empty name, or `null`. */
export function normalizeBuyerName(raw: unknown): string | null {
	return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}
