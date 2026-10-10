/**
 * The one outbound-fetch seam to Appmax's API — spec.md's Testing Decisions
 * ("Only fetch calls to Appmax's API are mocked") mocks exactly this
 * module's boundary, nothing inside `modules/billing` that calls it.
 *
 * Contract source: docs.appmax.com.br, read on 2026-10-09 and recorded in
 * PLANNING.md §13 ("Appmax API facts for the own checkout"), per ADR-0007
 * (our own checkout form on Appmax's API, not a hosted checkout). NOTHING
 * here has been exercised against a live sandbox call yet — no Appmax
 * account exists (PLANNING.md §12) — so the request/response shapes below
 * are what the docs say, not what Appmax was seen to do. Ticket 08
 * (.scratch/appmax-checkout/issues/08-sandbox-verification.md) closes that.
 *
 * Documented and implemented: OAuth2 client credentials (form body, Bearer
 * token, `expires_in` 3600); every path under `/v1`; money in cents;
 * `POST /v1/customers` → `data.customer.id`; `POST /v1/orders` →
 * `data.order{id,status}`; `POST /v1/payments/{credit-card|pix|boleto}`;
 * `GET /v1/orders/{id}` → `data.order{status,amounts{sub_total}}`,
 * `data.customer`, `data.payment`; `PATCH /v1/subscriptions/{id}/cancel`.
 *
 * UNVERIFIED, to settle in 08:
 *   - the product `type` enum (we send `digital`) and whether `customer_id`
 *     must be a number rather than the string we pass through;
 *   - whether the `ip`, `phone` format and `address` are mandatory on
 *     `POST /v1/customers` (we send no address);
 *   - the exact shape of `data.payment` on `GET /v1/orders/{id}` (we accept
 *     a string, or an object's `method`/`type`) and whether
 *     `customer.document_number` comes back on every method;
 *   - the card refusal's HTTP status (we match the body message "Payment not
 *     authorized" case-insensitively, whatever the 4xx) and the shape of an
 *     error body (we read `message`, falling back to `error`);
 *   - the Pix `qr_code` format (image or URL) and `expires_at` format;
 *   - `GET /v1/subscriptions/{id}`'s body (Mensal is ticket 09; the flat
 *     `data.status` read below is the old guess, left untouched).
 *
 * Token cache (decision): the access token is cached in module scope, keyed
 * on environment + `client_id`, and refreshed five minutes before its
 * `expires_in`. The webhook has a 5 s budget (PLANNING.md §13) and a token
 * round trip per refetch is wasted time; keying on the credentials means a
 * rotated `client_id` or an environment switch never reuses a stale token.
 * A failed token request is never cached, and a 401 from the API drops the
 * cached token so the next call re-authenticates. A Worker isolate that is
 * recycled just fetches a new one. KV is not used (PLANNING.md §3). Tests
 * reset the cache with `resetAppmaxTokenCache`.
 *
 * Logging: no function here logs. Request bodies carry personal data and a
 * card token, and an Appmax error message can echo them back, so neither
 * ever reaches the console or a Sentry message; callers get the message in
 * the `rejected` result and decide what is safe to do with it.
 *
 * Reported amount (ADR-0006 "amount verified after payment"): the order's
 * `amounts.sub_total` (cents, before `installment_fee`) is what the webhook
 * compares to `purchases.amount_cents`. Per Appmax's docs (2026-09-29) but
 * UNVERIFIED against a sandbox call (PLANNING.md §13): confirm `sub_total`
 * equals the `unit_value` we sent, with shipping and discount at 0. Until then
 * a response with no such field activates with a Sentry report instead of
 * rejecting (webhook.ts).
 *
 * `createHostedCheckoutSession` is DEPRECATED: it targets a hosted checkout
 * Appmax does not offer (ADR-0007) and is deleted together with the
 * `IPaymentProvider` seam change in ticket 02.
 */

import type { OfferName } from '../../content/catalog';
import {
	normalizeBuyerDocument,
	normalizeBuyerName,
	type BuyerFiscalData,
	type IPaymentProvider,
	type PaymentMethod,
	type PurchaseStatus,
} from './payment-provider';

type AppmaxCredentials = Pick<Cloudflare.Env, 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'> & {
	/** `'production'` switches to production hosts; anything else (including unset) is sandbox. */
	APPMAX_ENV?: string;
};

export type AppmaxPurchaseStatus = PurchaseStatus;
export type AppmaxPaymentMethod = 'card' | 'boleto' | 'pix';

/**
 * Only the exact literal `'production'` selects production; unset, empty or a typo'd
 * value is sandbox — the same fail-safe posture as `factory.ts`, so a test deploy can
 * never hit production money.
 */
export function appmaxHosts(appmaxEnv: string | undefined): { authUrl: string; apiBaseUrl: string } {
	const infix = appmaxEnv === 'production' ? '' : 'sandbox';
	return {
		authUrl: `https://auth.${infix}appmax.com.br/oauth2/token`,
		apiBaseUrl: `https://api.${infix}appmax.com.br`,
	};
}

/**
 * Why a call failed, the way callers need to tell them apart: bad credentials, Appmax down
 * (network, 5xx or an unreadable body), or the request itself refused (4xx). `message` is
 * Appmax's own text and may echo personal data: never log it.
 */
export type AppmaxFailure =
	| { ok: false; reason: 'auth_failed' }
	| { ok: false; reason: 'unavailable' }
	| { ok: false; reason: 'rejected'; status: number; message: string | null };

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

const tokenCache = new Map<string, { token: string; expiresAtMs: number }>();

/** Test hook (and credential-rotation escape hatch): forgets every cached access token. */
export function resetAppmaxTokenCache(): void {
	tokenCache.clear();
}

function tokenCacheKey(env: AppmaxCredentials): string {
	return `${env.APPMAX_ENV === 'production' ? 'production' : 'sandbox'}:${env.APPMAX_CLIENT_ID}`;
}

async function getAccessToken(env: AppmaxCredentials): Promise<{ ok: true; token: string } | AppmaxFailure> {
	const key = tokenCacheKey(env);
	const cached = tokenCache.get(key);
	if (cached !== undefined && Date.now() < cached.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) {
		return { ok: true, token: cached.token };
	}

	let response: Response;
	try {
		response = await fetch(appmaxHosts(env.APPMAX_ENV).authUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: env.APPMAX_CLIENT_ID,
				client_secret: env.APPMAX_CLIENT_SECRET,
			}),
		});
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
	if (response.status >= 500) return { ok: false, reason: 'unavailable' };
	if (!response.ok) return { ok: false, reason: 'auth_failed' };

	const body = await readJson(response);
	const token = isRecord(body) && typeof body.access_token === 'string' && body.access_token !== '' ? body.access_token : null;
	if (token === null) return { ok: false, reason: 'unavailable' };
	const ttlSeconds = isRecord(body) && typeof body.expires_in === 'number' ? body.expires_in : DEFAULT_TOKEN_TTL_SECONDS;
	tokenCache.set(key, { token, expiresAtMs: Date.now() + ttlSeconds * 1000 });
	return { ok: true, token };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

/** Appmax ids may arrive as numbers; the DB columns hold text. */
function idFrom(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

function stringFrom(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

function errorMessageFrom(body: unknown): string | null {
	if (!isRecord(body)) return null;
	return stringFrom(body.message) ?? stringFrom(body.error);
}

/** One authenticated call. Returns the parsed `data` envelope member (or `null`), never the raw body. */
async function appmaxRequest(
	env: AppmaxCredentials,
	method: 'GET' | 'POST' | 'PATCH',
	path: string,
	payload?: unknown
): Promise<{ ok: true; data: Record<string, unknown> } | AppmaxFailure> {
	const auth = await getAccessToken(env);
	if (!auth.ok) return auth;

	let response: Response;
	try {
		response = await fetch(`${appmaxHosts(env.APPMAX_ENV).apiBaseUrl}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${auth.token}`,
				Accept: 'application/json',
				...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
			},
			...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
		});
	} catch {
		return { ok: false, reason: 'unavailable' };
	}

	if (response.status === 401) {
		tokenCache.delete(tokenCacheKey(env));
		return { ok: false, reason: 'auth_failed' };
	}
	if (response.status >= 500) return { ok: false, reason: 'unavailable' };
	const body = await readJson(response);
	if (!response.ok) {
		return { ok: false, reason: 'rejected', status: response.status, message: errorMessageFrom(body) };
	}
	return { ok: true, data: isRecord(body) && isRecord(body.data) ? body.data : {} };
}

function section(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
	const value = data[key];
	return isRecord(value) ? value : null;
}

export type CreateCustomerParams = {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	/** CPF/CNPJ, digits only. */
	document: string;
	/** The buyer's IP as Appmax JS collected it (spec.md open question: or `CF-Connecting-IP`, settled in 08). */
	ip: string;
};

export type CreateCustomerResult = { ok: true; customerId: string } | AppmaxFailure;

export async function createCustomer(env: AppmaxCredentials, params: CreateCustomerParams): Promise<CreateCustomerResult> {
	const result = await appmaxRequest(env, 'POST', '/v1/customers', {
		first_name: params.firstName,
		last_name: params.lastName,
		email: params.email,
		phone: params.phone,
		document_number: params.document,
		ip: params.ip,
	});
	if (!result.ok) return result;
	const customerId = idFrom(section(result.data, 'customer')?.id);
	return customerId === null ? { ok: false, reason: 'unavailable' } : { ok: true, customerId };
}

export type CreateOrderParams = {
	customerId: string;
	/** `<robot>:<offer>`. */
	sku: string;
	name: string;
	amountCents: number;
};

export type CreateOrderResult = { ok: true; orderId: string; status: string } | AppmaxFailure;

export async function createOrder(env: AppmaxCredentials, params: CreateOrderParams): Promise<CreateOrderResult> {
	const result = await appmaxRequest(env, 'POST', '/v1/orders', {
		customer_id: params.customerId,
		products: [{ sku: params.sku, name: params.name, quantity: 1, unit_value: params.amountCents, type: 'digital' }],
		shipping_value: 0,
		discount_value: 0,
	});
	if (!result.ok) return result;
	const order = section(result.data, 'order');
	const orderId = idFrom(order?.id);
	if (order === null || orderId === null) return { ok: false, reason: 'unavailable' };
	return { ok: true, orderId, status: stringFrom(order.status) ?? 'pendente' };
}

export type PayCreditCardParams = {
	orderId: string;
	customerId: string;
	/** From Appmax JS in the browser; card data never reaches our Worker (ADR-0007). */
	token: string;
	holderName: string;
	holderDocument: string;
	softDescriptor: string;
};

export type PayCreditCardResult =
	| { ok: true; orderStatus: string }
	| { ok: false; reason: 'not_authorized' }
	| AppmaxFailure;

const NOT_AUTHORIZED = /payment not authorized/i;

/** No parcelamento in 0.1 (PLANNING.md §6): always one installment. */
export async function payCreditCard(env: AppmaxCredentials, params: PayCreditCardParams): Promise<PayCreditCardResult> {
	const result = await appmaxRequest(env, 'POST', '/v1/payments/credit-card', {
		order_id: params.orderId,
		customer_id: params.customerId,
		payment_data: {
			credit_card: {
				token: params.token,
				holder_document_number: params.holderDocument,
				holder_name: params.holderName,
				installments: 1,
				soft_descriptor: params.softDescriptor,
			},
		},
	});
	if (!result.ok) {
		if (result.reason === 'rejected' && result.message !== null && NOT_AUTHORIZED.test(result.message)) {
			return { ok: false, reason: 'not_authorized' };
		}
		return result;
	}
	const status = stringFrom(section(result.data, 'order')?.status);
	return status === null ? { ok: false, reason: 'unavailable' } : { ok: true, orderStatus: status };
}

export type PixInstructions = { qrCode: string; emvCode: string; expiresAt: string };
export type BoletoInstructions = { pdfUrl: string; digitableLine: string; dueDate: string };

export type PayPixResult = { ok: true; pix: PixInstructions } | AppmaxFailure;
export type PayBoletoResult = { ok: true; boleto: BoletoInstructions } | AppmaxFailure;

export async function payPix(env: AppmaxCredentials, params: { orderId: string; document: string }): Promise<PayPixResult> {
	const result = await appmaxRequest(env, 'POST', '/v1/payments/pix', {
		order_id: params.orderId,
		payment_data: { pix: { document_number: params.document } },
	});
	if (!result.ok) return result;
	const pix = section(result.data, 'pix');
	const qrCode = stringFrom(pix?.qr_code);
	const emvCode = stringFrom(pix?.emv_code);
	const expiresAt = stringFrom(pix?.expires_at);
	if (qrCode === null || emvCode === null || expiresAt === null) return { ok: false, reason: 'unavailable' };
	return { ok: true, pix: { qrCode, emvCode, expiresAt } };
}

export async function payBoleto(env: AppmaxCredentials, params: { orderId: string; document: string }): Promise<PayBoletoResult> {
	const result = await appmaxRequest(env, 'POST', '/v1/payments/boleto', {
		order_id: params.orderId,
		payment_data: { boleto: { document_number: params.document } },
	});
	if (!result.ok) return result;
	const boleto = section(result.data, 'boleto');
	const pdfUrl = stringFrom(boleto?.pdf_url);
	const digitableLine = stringFrom(boleto?.digitable_line);
	const dueDate = stringFrom(boleto?.due_date);
	if (pdfUrl === null || digitableLine === null || dueDate === null) return { ok: false, reason: 'unavailable' };
	return { ok: true, boleto: { pdfUrl, digitableLine, dueDate } };
}

export type GetOrderResult =
	| {
			ok: true;
			/** Appmax's own status string, lowercased. */
			rawStatus: string;
			status: AppmaxPurchaseStatus;
			paymentMethod: AppmaxPaymentMethod | null;
			email: string | null;
			/** `customer.name` / `customer.document_number` (ticket 13, NFS-e); document is digits only or `null`. */
			buyer: BuyerFiscalData;
			/** `amounts.sub_total` in cents (see header); `null` when the response carries none. */
			reportedAmountCents: number | null;
	  }
	| AppmaxFailure;

export async function getOrder(env: AppmaxCredentials, orderId: string): Promise<GetOrderResult> {
	const result = await appmaxRequest(env, 'GET', `/v1/orders/${orderId}`);
	if (!result.ok) return result;
	const order = section(result.data, 'order');
	const rawStatus = stringFrom(order?.status);
	if (order === null || rawStatus === null) return { ok: false, reason: 'unavailable' };

	const customer = section(result.data, 'customer');
	const subTotal = section(order, 'amounts')?.sub_total;
	const status = rawStatus.toLowerCase();
	return {
		ok: true,
		rawStatus: status,
		status: mapOrderStatus(status),
		paymentMethod: mapAppmaxPaymentMethod(result.data.payment),
		email: stringFrom(customer?.email),
		buyer: {
			name: normalizeBuyerName(customer?.name),
			document: normalizeBuyerDocument(customer?.document_number),
		},
		reportedAmountCents: typeof subTotal === 'number' ? subTotal : null,
	};
}

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

/** @deprecated Appmax has no hosted checkout (ADR-0007); deleted in ticket 02. */
export async function createHostedCheckoutSession(
	env: AppmaxCredentials,
	params: CreateHostedCheckoutSessionParams
): Promise<CreateHostedCheckoutSessionResult> {
	const result = await appmaxRequest(env, 'POST', '/payment-links', {
		external_id: params.reference,
		amount: params.amountCents,
		payment_methods: params.allowedMethods,
		recurring: params.offer === 'monthly',
		return_url: params.returnUrl,
		metadata: { robot_id: params.robotId, offer: params.offer },
	});
	if (!result.ok) return { ok: false, reason: result.reason === 'auth_failed' ? 'appmax_auth_failed' : 'appmax_unavailable' };
	const checkoutUrl = stringFrom(result.data.url);
	if (checkoutUrl === null) return { ok: false, reason: 'appmax_unavailable' };
	return { ok: true, checkoutUrl, appmaxOrderId: idFrom(result.data.order_id) };
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
 * best guess (Appmax's admin UI is pt-BR) via `mapOrderStatus` below.
 */
export type FetchAuthoritativeStatusResult =
	| {
			ok: true;
			status: AppmaxPurchaseStatus;
			paymentMethod: AppmaxPaymentMethod | null;
			// The buyer's email (`customer.email`, unverified — header comment). `null` when the response carries none, which
			// customer-area/issues/01 treats as a visible failure rather than
			// silently leaving `customers` unpopulated.
			email: string | null;
			// `customer.name` / `customer.document_number` of the order response (ticket 13,
			// NFS-e); never from the webhook payload. Both `null` for a subscription response,
			// which carries no customer.
			buyer: BuyerFiscalData;
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
	if (ref.subscriptionId === null) {
		if (ref.orderId === null) return { ok: false };
		const order = await getOrder(env, ref.orderId);
		if (!order.ok) return { ok: false };
		return {
			ok: true,
			status: order.status,
			paymentMethod: order.paymentMethod,
			email: order.email,
			buyer: order.buyer,
			reportedAmountCents: order.reportedAmountCents,
			...(order.rawStatus === ORDER_REVIEW_STATUS
				? { operatorReview: `Appmax order status ${ORDER_REVIEW_STATUS}: paid, refund requested before integration` }
				: {}),
		};
	}

	// Mensal is ticket 09: the subscription resource's body is still the old unverified
	// guess (flat `data.status`), only the path gained its `/v1` prefix.
	const result = await appmaxRequest(env, 'GET', `/v1/subscriptions/${ref.subscriptionId}`);
	if (!result.ok) return { ok: false };
	const rawStatus = stringFrom(result.data.status);
	if (rawStatus === null) return { ok: false };
	return {
		ok: true,
		status: mapSubscriptionStatus(rawStatus.toLowerCase()),
		paymentMethod: mapAppmaxPaymentMethod(result.data.payment_method),
		email: stringFrom(result.data.email) ?? stringFrom(section(result.data, 'customer')?.email),
		buyer: { name: null, document: null },
		reportedAmountCents: null,
	};
}

/**
 * `PATCH /v1/subscriptions/{id}/cancel`, immediate (PLANNING.md §13, docs read 2026-09-29);
 * no body, the path already scopes it. Not exercised against a real sandbox.
 */
export async function cancelSubscription(
	env: AppmaxCredentials,
	appmaxSubscriptionId: string
): Promise<{ ok: true } | { ok: false }> {
	const result = await appmaxRequest(env, 'PATCH', `/v1/subscriptions/${appmaxSubscriptionId}/cancel`);
	return result.ok ? { ok: true } : { ok: false };
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

/**
 * `data.payment` on the order response: its exact shape is unverified (header), so accept a
 * bare string or an object's `method`/`type`; unknown values map to `null`.
 */
function mapAppmaxPaymentMethod(raw: unknown): AppmaxPaymentMethod | null {
	const value = isRecord(raw) ? (raw.method ?? raw.type) : raw;
	if (typeof value !== 'string') return null;
	switch (value.toLowerCase()) {
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
