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
 *
 * Reported amount (ADR-0006 "amount verified after payment"): the order's
 * `amounts.sub_total` (cents, before `installment_fee`) is what the webhook
 * compares to `purchases.amount_cents`. Per Appmax's docs (2026-09-29) but
 * UNVERIFIED against a sandbox call (PLANNING.md §13): confirm `sub_total`
 * equals the `unit_value` we sent, with shipping and discount at 0. Until then
 * a response with no such field activates with a Sentry report instead of
 * rejecting (webhook.ts).
 */

import type { OfferName } from '../../content/catalog';
import type { IPaymentProvider, PaymentMethod, PurchaseStatus } from './payment-provider';

const APPMAX_AUTH_URL = 'https://auth.sandboxappmax.com.br/oauth2/token';
const APPMAX_API_BASE_URL = 'https://api.sandboxappmax.com.br';

type AppmaxCredentials = Pick<Cloudflare.Env, 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'>;

export type AppmaxPurchaseStatus = PurchaseStatus;
export type AppmaxPaymentMethod = 'card' | 'boleto' | 'pix';

type CreateHostedCheckoutSessionParams = {
	reference: string;
	robotId: string;
	offer: OfferName;
	amountCents: number;
	allowedMethods: PaymentMethod[];
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
			// UNVERIFIED field names (this file's header): `payment_methods` restricts
			// the hosted page to what the Oferta allows (Mensal card-only), `recurring`
			// marks Mensal. The docs say Mensal is really an order followed by
			// `POST /v1/subscriptions` (catalog-pivot 03 "Appmax findings") — to be
			// settled against the sandbox.
			payment_methods: params.allowedMethods,
			recurring: params.offer === 'monthly',
			return_url: params.returnUrl,
			metadata: { robot_id: params.robotId, offer: params.offer },
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

/** Appmax ids may arrive as numbers; the DB columns hold text. */
function idFrom(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

/**
 * Returns `null` for a payload that isn't a recognisable Appmax webhook — ticket 06's
 * payload-shape validation is the hardening layer; this is just enough to not crash on
 * garbage. The documented envelope is `{event, event_type, data{order_id, ...}}`
 * (docs.appmax.com.br/guides/webhooks); a top-level id is still accepted as a fallback.
 */
export function parseWebhookPayload(raw: unknown): AppmaxWebhookEvent | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const body = raw as Record<string, unknown>;
	if (typeof body.event !== 'string' || body.event === '') return null;
	const data = typeof body.data === 'object' && body.data !== null ? (body.data as Record<string, unknown>) : {};
	const orderId = idFrom(data.order_id) ?? idFrom(body.order_id);
	const subscriptionId = idFrom(data.subscription_id) ?? idFrom(body.subscription_id);
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
			status: AppmaxPurchaseStatus;
			paymentMethod: AppmaxPaymentMethod | null;
			// The buyer's email — unverified field name, same status as
			// `order_id`/`payment_method` above (this file's header comment,
			// PLANNING.md §13). `null` when the response carries none, which
			// customer-area/issues/01 treats as a visible failure rather than
			// silently leaving `customers` unpopulated.
			email: string | null;
			// `amounts.sub_total` in cents (see header); `null` for a subscription or an
			// order response that carries none.
			reportedAmountCents: number | null;
			// Set when the operator must look at this order (paid, refund requested before
			// integration): the status stays put, the webhook reports it to Sentry.
			operatorReview?: string;
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

	const body = await response.json<{
		data: {
			status: string;
			payment_method?: string;
			email?: string;
			amounts?: { sub_total?: number };
		};
	}>();
	const isSubscription = ref.subscriptionId !== null;
	const rawStatus = body.data.status.toLowerCase();
	const subTotal = body.data.amounts?.sub_total;
	return {
		ok: true,
		status: isSubscription ? mapSubscriptionStatus(rawStatus) : mapOrderStatus(rawStatus),
		paymentMethod: mapAppmaxPaymentMethod(body.data.payment_method),
		email: body.data.email ?? null,
		reportedAmountCents: !isSubscription && typeof subTotal === 'number' ? subTotal : null,
		...(rawStatus === ORDER_REVIEW_STATUS
			? { operatorReview: `Appmax order status ${ORDER_REVIEW_STATUS}: paid, refund requested before integration` }
			: {}),
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

const ORDER_REVIEW_STATUS = 'pendente_integracao_em_analise';

/**
 * Order `status` per docs.appmax.com.br (catalog-pivot ticket 04). `cancelado` (declined
 * card, expired Pix, panel order without payment) maps to `pending`, never `canceled`:
 * `canceled` outranks `active`, so it would let a never-paid order overwrite a paid one.
 * A `pending` write never downgrades a higher-ranked row (STATUS_RIGIDITY). A won dispute
 * (`chargeback_vencido`) stays `chargeback`; the operator restores it by hand.
 */
function mapOrderStatus(status: string): AppmaxPurchaseStatus {
	switch (status) {
		case 'aprovado':
		case 'integrado':
		case 'pendente_integracao':
			return 'active';
		case 'estornado':
		case 'recusado_por_risco':
			return 'refunded';
		case 'chargeback_em_tratativa':
		case 'chargeback_em_disputa':
		case 'chargeback_perdido':
		case 'chargeback_vencido':
			return 'chargeback';
		// pendente, autorizado, cancelado, ORDER_REVIEW_STATUS, and anything unrecognised:
		// don't guess at something more consequential than pending.
		default:
			return 'pending';
	}
}

/** Subscription resource statuses (`ACTIVE`/`CANCELLED`; the full list is unknown). */
function mapSubscriptionStatus(status: string): AppmaxPurchaseStatus {
	if (status === 'active') return 'active';
	if (status === 'cancelled' || status === 'canceled') return 'canceled';
	if (['past_due', 'overdue', 'atrasado'].includes(status)) return 'past_due';
	return 'pending';
}

/**
 * Adapter onto the shared `IPaymentProvider` seam (docs/adr/0005) —
 * `factory.ts` selects this by default. Every function above is unchanged;
 * this only reshapes their results to the generic contract (`appmaxOrderId`
 * → `providerOrderId`, `appmax_auth_failed`/`appmax_unavailable` →
 * `provider_auth_failed`/`provider_unavailable`).
 */
export const appmaxProvider: IPaymentProvider = {
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
