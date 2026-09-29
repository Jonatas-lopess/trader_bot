/**
 * Stripe driver for the payment-provider seam (docs/adr/0005-stripe-test-
 * driver.md) — a test-mode stand-in for Appmax while Appmax's own account
 * signup is blocked. NOT the committed production gateway: ADR-0003 still
 * stands, and `factory.ts` only selects this on an explicit
 * `PAYMENT_PROVIDER=stripe`. Unlike appmax-client.ts, the request/response
 * shapes here are Stripe's own well-documented, stable REST API
 * (https://docs.stripe.com/api) — no "unverified contract" caveat needed —
 * used with plain `fetch` (no SDK), same convention as
 * `modules/identity/resend-client.ts`.
 *
 * Test mode only: nothing here handles Boleto/Pix (Stripe's Brazilian
 * local-method support requires an onboarded BR account, the exact thing
 * this driver exists to work around not having yet) — card only.
 */

import type { OfferName } from '../../content/catalog';
import type { IPaymentProvider, PurchaseStatus } from './payment-provider';

type StripeCredentials = Pick<Cloudflare.Env, 'STRIPE_SECRET_KEY'>;

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';

export type StripePurchaseStatus = PurchaseStatus;

type CreateCheckoutSessionParams = {
	reference: string;
	robotId: string;
	offer: OfferName;
	amountCents: number;
	returnUrl: string;
	cancelUrl: string;
};

export type CreateCheckoutSessionResult =
	| { ok: true; checkoutUrl: string; sessionId: string | null }
	| { ok: false; reason: 'stripe_auth_failed' | 'stripe_unavailable' };

function authHeaders(env: StripeCredentials): Record<string, string> {
	return {
		Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
		'Content-Type': 'application/x-www-form-urlencoded',
		Accept: 'application/json',
	};
}

export async function createCheckoutSession(
	env: StripeCredentials,
	params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
	// `monthly` is the only recurring Oferta; `one_time` and `annual` are a single
	// charge (ADR-0006). Card only for every Oferta — this driver never offers
	// Boleto/Pix (see the file header), which also satisfies Mensal's card-only rule.
	const recurring = params.offer === 'monthly';
	const body = new URLSearchParams({
		mode: recurring ? 'subscription' : 'payment',
		client_reference_id: params.reference,
		success_url: params.returnUrl,
		cancel_url: params.cancelUrl,
		'line_items[0][quantity]': '1',
		'line_items[0][price_data][currency]': 'brl',
		'line_items[0][price_data][unit_amount]': String(params.amountCents),
		'line_items[0][price_data][product_data][name]': `Robô Trader — ${params.robotId}`,
		'payment_method_types[]': 'card',
		'metadata[reference]': params.reference,
		'metadata[robot_id]': params.robotId,
		'metadata[offer]': params.offer,
	});
	if (recurring) body.set('line_items[0][price_data][recurring][interval]', 'month');

	let response: Response;
	try {
		response = await fetch(`${STRIPE_API_BASE_URL}/checkout/sessions`, {
			method: 'POST',
			headers: authHeaders(env),
			body,
		});
	} catch {
		return { ok: false, reason: 'stripe_unavailable' };
	}

	if (response.status === 401) return { ok: false, reason: 'stripe_auth_failed' };
	if (!response.ok) return { ok: false, reason: 'stripe_unavailable' };

	const parsed = await response.json<{ id: string; url: string | null }>();
	if (parsed.url === null) return { ok: false, reason: 'stripe_unavailable' };
	return { ok: true, checkoutUrl: parsed.url, sessionId: parsed.id };
}

export type FetchAuthoritativeStatusResult =
	| {
			ok: true;
			status: StripePurchaseStatus;
			paymentMethod: 'card' | null;
			email: string | null;
			/** Subscription: unit price x quantity of its first item. Session: `amount_subtotal`, the price sent as `unit_amount` before any discount or tax. */
			reportedAmountCents: number | null;
	  }
	| { ok: false };

/**
 * `ref.subscriptionId` is a Stripe subscription id (`sub_...`) once one
 * exists; `ref.orderId` is the checkout session id (`cs_...`) minted at
 * checkout time, still resolvable even before a subscription is created —
 * same "always have something to look the row up by" shape as
 * appmax-client.ts's `orderId`/`subscriptionId` pair.
 */
export async function fetchAuthoritativeStatus(
	env: StripeCredentials,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<FetchAuthoritativeStatusResult> {
	if (ref.subscriptionId !== null) {
		// `expand[]=customer` — checkout.session.completed fires with the
		// subscription id already attached (before any invoice-paid event),
		// so this is the normal first-purchase path, not a rare later-event
		// case; without the expand, Stripe's own `customer` field is just an
		// id string, and provisioning needs the buyer's actual email.
		const response = await fetch(
			`${STRIPE_API_BASE_URL}/subscriptions/${ref.subscriptionId}?expand[]=customer`,
			{ headers: authHeaders(env) }
		);
		if (!response.ok) return { ok: false };
		const body = await response.json<{
			status: string;
			customer: { email: string | null } | string;
			items?: { data?: { quantity?: number; price?: { unit_amount?: number | null } }[] };
		}>();
		const email = typeof body.customer === 'string' ? null : (body.customer?.email ?? null);
		const item = body.items?.data?.[0];
		const unitAmount = item?.price?.unit_amount;
		const reportedAmountCents = typeof unitAmount === 'number' ? unitAmount * (item?.quantity ?? 1) : null;
		return { ok: true, status: mapSubscriptionStatus(body.status), paymentMethod: 'card', email, reportedAmountCents };
	}

	if (ref.orderId === null) return { ok: false };

	const response = await fetch(
		`${STRIPE_API_BASE_URL}/checkout/sessions/${ref.orderId}?expand[]=customer_details`,
		{ headers: authHeaders(env) }
	);
	if (!response.ok) return { ok: false };

	const body = await response.json<{
		status: string;
		payment_status: string;
		subscription: string | null;
		amount_subtotal?: number | null;
		customer_details: { email: string | null } | null;
	}>();
	return {
		ok: true,
		status: mapSessionStatus(body.status, body.payment_status),
		paymentMethod: body.payment_status === 'paid' ? 'card' : null,
		email: body.customer_details?.email ?? null,
		reportedAmountCents: typeof body.amount_subtotal === 'number' ? body.amount_subtotal : null,
	};
}

/** Stripe's own cancel-subscription endpoint — immediate, no proration handling (out of scope for a test-only driver). */
export async function cancelSubscription(
	env: StripeCredentials,
	stripeSubscriptionId: string
): Promise<{ ok: true } | { ok: false }> {
	const response = await fetch(`${STRIPE_API_BASE_URL}/subscriptions/${stripeSubscriptionId}`, {
		method: 'DELETE',
		headers: authHeaders(env),
	});
	if (!response.ok) return { ok: false };
	return { ok: true };
}

function mapSubscriptionStatus(raw: string): StripePurchaseStatus {
	if (raw === 'active' || raw === 'trialing') return 'active';
	if (raw === 'past_due' || raw === 'unpaid') return 'past_due';
	if (raw === 'canceled') return 'canceled';
	// 'incomplete' or anything unrecognised: same "don't guess at something
	// more consequential than pending" rule as appmax-client.ts's fallback.
	return 'pending';
}

function mapSessionStatus(status: string, paymentStatus: string): StripePurchaseStatus {
	// An expired session was never paid: `pending`, not `canceled` (which outranks
	// `active`). A retry is a fresh checkout, never a resumed session.
	if (status === 'expired') return 'pending';
	if (status === 'complete' && paymentStatus === 'paid') return 'active';
	return 'pending';
}

/** Adapter onto the shared `IPaymentProvider` seam (docs/adr/0005) — selected by `factory.ts` only on explicit `PAYMENT_PROVIDER=stripe`. */
export const stripeProvider: IPaymentProvider = {
	id: 'stripe',
	async createCheckoutSession(env, params) {
		const result = await createCheckoutSession(env, {
			reference: params.reference,
			robotId: params.robotId,
			offer: params.offer,
			amountCents: params.amountCents,
			returnUrl: params.returnUrl,
			cancelUrl: params.cancelUrl,
		});
		if (!result.ok) {
			return {
				ok: false,
				reason: result.reason === 'stripe_auth_failed' ? 'provider_auth_failed' : 'provider_unavailable',
			};
		}
		return { ok: true, checkoutUrl: result.checkoutUrl, providerOrderId: result.sessionId };
	},
	fetchAuthoritativeStatus,
	cancelSubscription,
};
