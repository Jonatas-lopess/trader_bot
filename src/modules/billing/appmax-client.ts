/**
 * The one outbound-fetch seam to Appmax's API — spec.md's Testing Decisions
 * ("Only fetch calls to Appmax's API are mocked") mocks exactly this
 * module's boundary, nothing inside `modules/billing` that calls it.
 *
 * UNVERIFIED CONTRACT. spec.md's Further Notes flag the exact Appmax
 * hosted-checkout request/response contract as "not fully pinned down in
 * this spec — confirm against Appmax's sandbox during implementation". No
 * Appmax sandbox credentials were available while writing this file — the
 * base URLs, auth flow and request/response field names below are the
 * best-documented approximation from Appmax's public docs
 * (docs.appmax.com.br, help-center.appmax.com.br) and have NOT been
 * exercised against a live sandbox call. Recorded as unverified in
 * PLANNING.md §13, same status as this repo's other unconfirmed Appmax
 * facts. Whoever gets sandbox access next should verify this file's field
 * names against a real call before go-live; nothing downstream (the D1
 * writes, the webhook's re-fetch, idempotency) depends on these exact field
 * names being right, only on this module's exported function signatures
 * staying the same — that's the point of keeping this the one seam.
 *
 * Correlation design: rather than depend on an unconfirmed Appmax field to
 * find our own row from the post-payment redirect, we mint our own opaque
 * `reference` (modules/billing/checkout.ts) before calling Appmax and pass
 * it as both `external_id` (assuming Appmax echoes a merchant-supplied
 * reference back, per the `external_id`/`external_key` fields documented
 * elsewhere in Appmax's API) and embedded in `return_url`, which every
 * hosted-checkout provider supports configuring. The redirect therefore
 * always carries our reference regardless of whether `external_id` turns
 * out to be real.
 */

import type { PaymentProvider } from './payment-provider';

const APPMAX_AUTH_URL = 'https://auth.sandboxappmax.com.br/oauth2/token';
const APPMAX_API_BASE_URL = 'https://api.sandboxappmax.com.br';

type AppmaxCredentials = Pick<Cloudflare.Env, 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'>;

export type AppmaxSubscriptionState = 'pending' | 'active' | 'past_due' | 'canceled';
export type AppmaxPaymentMethod = 'card' | 'boleto' | 'pix';

type CreateHostedCheckoutSessionParams = {
	reference: string;
	planId: string;
	amountCents: number;
	returnUrl: string;
};

export type CreateHostedCheckoutSessionResult =
	| { ok: true; checkoutUrl: string; appmaxOrderId: string | null }
	| { ok: false; reason: 'appmax_auth_failed' | 'appmax_unavailable' };

async function getAccessToken(env: AppmaxCredentials): Promise<string | null> {
	const response = await fetch(APPMAX_AUTH_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: env.APPMAX_CLIENT_ID,
			client_secret: env.APPMAX_CLIENT_SECRET,
		}),
	});
	if (!response.ok) return null;
	const body = await response.json<{ access_token: string }>();
	return body.access_token;
}

export async function createHostedCheckoutSession(
	env: AppmaxCredentials,
	params: CreateHostedCheckoutSessionParams
): Promise<CreateHostedCheckoutSessionResult> {
	const token = await getAccessToken(env);
	if (token === null) return { ok: false, reason: 'appmax_auth_failed' };

	const response = await fetch(`${APPMAX_API_BASE_URL}/payment-links`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			external_id: params.reference,
			amount: params.amountCents,
			return_url: params.returnUrl,
			metadata: { plan_id: params.planId },
		}),
	});
	if (!response.ok) return { ok: false, reason: 'appmax_unavailable' };

	const body = await response.json<{ data: { url: string; order_id?: string } }>();
	return { ok: true, checkoutUrl: body.data.url, appmaxOrderId: body.data.order_id ?? null };
}

/**
 * Webhook payload shape: `event`, `order_id`, `subscription_id`. Unlike the
 * rest of this file, these three field names carry higher confidence — they
 * appear verbatim in spec.md's Implementation Decisions ("Idempotency key:
 * `order_id + event` ... `subscription_id + order_id + event` (Appmax's own
 * recommendation)"), which spec.md says was transcribed from "Appmax's
 * documented best practice pasted into this effort's originating
 * conversation" — i.e. someone read the real docs for this one detail. The
 * rest of the payload's shape is still unverified.
 */
export type AppmaxWebhookEvent = {
	event: string;
	orderId: string | null;
	subscriptionId: string | null;
};

/** Returns `null` for a payload that isn't a recognisable Appmax webhook — ticket 06's payload-shape validation is the hardening layer; this is just enough to not crash on garbage. */
export function parseWebhookPayload(raw: unknown): AppmaxWebhookEvent | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const body = raw as Record<string, unknown>;
	if (typeof body.event !== 'string' || body.event === '') return null;
	const orderId = typeof body.order_id === 'string' ? body.order_id : null;
	const subscriptionId = typeof body.subscription_id === 'string' ? body.subscription_id : null;
	if (orderId === null && subscriptionId === null) return null;
	return { event: body.event, orderId, subscriptionId };
}

/**
 * spec.md's Webhook trust model: "every event triggers one Appmax API call
 * to fetch that record's current authoritative status before any state
 * transition is applied" — the payload's own status field is never used.
 * Endpoint paths and the response envelope are the same unverified-contract
 * caveat as this file's header; status/payment-method string values are a
 * best guess (Appmax's admin UI is pt-BR) via `mapAppmaxStatus` below.
 */
export type FetchAuthoritativeStatusResult =
	| {
			ok: true;
			status: AppmaxSubscriptionState;
			paymentMethod: AppmaxPaymentMethod | null;
			// The buyer's email — unverified field name, same status as
			// `order_id`/`payment_method` above (this file's header comment,
			// PLANNING.md §13). `null` when the response carries none, which
			// customer-area/issues/01 treats as a visible failure rather than
			// silently leaving `customers` unpopulated.
			email: string | null;
	  }
	| { ok: false };

export async function fetchAuthoritativeStatus(
	env: AppmaxCredentials,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<FetchAuthoritativeStatusResult> {
	const token = await getAccessToken(env);
	if (token === null) return { ok: false };

	const path = ref.subscriptionId !== null
		? `/subscriptions/${ref.subscriptionId}`
		: `/orders/${ref.orderId}`;
	const response = await fetch(`${APPMAX_API_BASE_URL}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	if (!response.ok) return { ok: false };

	const body = await response.json<{ data: { status: string; payment_method?: string; email?: string } }>();
	return {
		ok: true,
		status: mapAppmaxStatus(body.data.status),
		paymentMethod: mapAppmaxPaymentMethod(body.data.payment_method),
		email: body.data.email ?? null,
	};
}

/**
 * spec.md's Further Notes: "Appmax's cancel-subscription API's exact
 * request/response shape ... unverified against a live sandbox call" — same
 * status as this file's other unverified endpoints. Best-guess REST shape
 * (POST to a `/cancel` sub-resource, no body needed since the path already
 * scopes it), not exercised against a real sandbox.
 */
export async function cancelSubscription(
	env: AppmaxCredentials,
	appmaxSubscriptionId: string
): Promise<{ ok: true } | { ok: false }> {
	const token = await getAccessToken(env);
	if (token === null) return { ok: false };

	const response = await fetch(`${APPMAX_API_BASE_URL}/subscriptions/${appmaxSubscriptionId}/cancel`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	if (!response.ok) return { ok: false };

	return { ok: true };
}

function mapAppmaxStatus(raw: string): AppmaxSubscriptionState {
	const normalized = raw.toLowerCase();
	if (['aprovado', 'pago', 'approved', 'paid', 'active'].includes(normalized)) return 'active';
	if (['cancelado', 'estornado', 'recusado', 'canceled', 'refused'].includes(normalized)) {
		return 'canceled';
	}
	if (['atrasado', 'past_due', 'overdue'].includes(normalized)) return 'past_due';
	// Unrecognised value: fall back to `pending` rather than guess at
	// something more consequential — a compare-and-swap on `pending` never
	// downgrades an already-more-current row (0002's rigidity ranking).
	return 'pending';
}

/**
 * Adapter onto the shared `PaymentProvider` seam (docs/adr/0005) —
 * `factory.ts` selects this by default. Every function above is unchanged;
 * this only reshapes their results to the generic contract (`appmaxOrderId`
 * → `providerOrderId`, `appmax_auth_failed`/`appmax_unavailable` →
 * `provider_auth_failed`/`provider_unavailable`).
 */
export const appmaxProvider: PaymentProvider = {
	id: 'appmax',
	async createCheckoutSession(env, params) {
		const result = await createHostedCheckoutSession(env, params);
		if (!result.ok) {
			return {
				ok: false,
				reason: result.reason === 'appmax_auth_failed' ? 'provider_auth_failed' : 'provider_unavailable',
			};
		}
		return { ok: true, checkoutUrl: result.checkoutUrl, providerOrderId: result.appmaxOrderId };
	},
	fetchAuthoritativeStatus,
	cancelSubscription,
};

function mapAppmaxPaymentMethod(raw: string | undefined): AppmaxPaymentMethod | null {
	switch (raw?.toLowerCase()) {
		case 'boleto':
			return 'boleto';
		case 'pix':
			return 'pix';
		case 'cartao':
		case 'credit_card':
		case 'card':
			return 'card';
		default:
			return null;
	}
}
