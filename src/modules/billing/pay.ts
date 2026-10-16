/**
 * `POST /checkout/pay` (.scratch/appmax-checkout/issues/05-pay-endpoint.md, ADR-0007): the
 * own checkout form's submit. `src/pages/checkout/pay.ts` is the thin adapter around this.
 *
 * Pays for a cart (storefront-v2 11, ADR-0008): N lines priced by `priceCheckout`, one
 * `purchases` row per Licença sharing `checkout_id = reference` (the first row's `id` is the
 * reference), one Appmax order with one `products[]` entry per line, one payment for the order.
 * A single item is a one-line cart. Buyer fields are copied to every row (NFS-e).
 *
 * Order of the steps is a decision (spec.md "Decisions carried by the tickets"):
 *   1. rate limit by IP, then validate; the price comes from the catalog, nothing price-like in
 *      the body is read (ADR-0006);
 *   2. INSERT every provisional row (one transaction, the first with `id = reference`) BEFORE
 *      calling Appmax, so a repeated POST hits the primary key and creates nothing a second time;
 *   3. customer, order, then `appmax_order_id` on every row BEFORE the payment call, so a paid
 *      order always has rows the webhook can find (no row update, no payment);
 *   4. the payment; Pix and Boleto instructions are stored on every row of the checkout for the
 *      confirmation page, which reads the group by `checkout_id`.
 *
 * Calls `appmax-client.ts` directly: one own-form provider exists, no second abstraction.
 * Card data never reaches this Worker, only Appmax JS's token. Nothing here logs the body,
 * the token or any buyer field; Sentry gets the purchase id and reason codes only.
 *
 * A failed attempt's row stays `pending` and inert (the confirmation page treats a stale
 * `pending` as retry-from-catalog). Which failures answer with a fresh `reference` is the
 * double-charge guard:
 * - before the payment call (customer, order, order id) nothing can have been charged, so the
 *   502 carries a fresh `reference` and the form's retry is a new attempt;
 * - a refusal (402: declined card, order `cancelado`) is final at Appmax, so a fresh `reference`;
 * - any other failure of the payment call itself (5xx, timeout, unreadable answer) may have
 *   charged: the 502 carries no `reference`, the form keeps its own, and the retry is a repeated
 *   POST that lands on this attempt's confirmation page and calls nothing at Appmax.
 */

import * as Sentry from '@sentry/cloudflare';
import {
	createCustomer,
	createOrder,
	payBoleto,
	payCreditCard,
	payPix,
	type AppmaxFailure,
	type BoletoInstructions,
	type PixInstructions,
} from './appmax-client';
import { normalizeBuyerInput, type BuyerInput, type FieldErrors } from './buyer-input';
import type { CheckoutRow } from './checkout-lines';
import { paymentMethodsFor, type PaymentMethod } from './payment-provider';
import { priceCheckout, type RawCheckoutLine } from './price-checkout';
import { CARD_DECLINED_MARKER } from './status';

type PayEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'PAY_RATE_LIMITER'> & {
	APPMAX_ENV?: string;
};

export type PayFailureCode =
	| 'invalid_request'
	| 'invalid_buyer'
	| 'unknown_offer'
	| 'offer_not_supported'
	| 'method_not_allowed'
	| 'token_required';

export type PayResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; status: 400; code: 'invalid_buyer'; fieldErrors: FieldErrors }
	| { ok: false; status: 400; code: Exclude<PayFailureCode, 'invalid_buyer'> }
	| { ok: false; status: 402; code: 'card_declined'; reference: string }
	| { ok: false; status: 429; code: 'rate_limited' }
	| { ok: false; status: 502; code: 'provider_unavailable'; reference?: string };

/** What appears on the Cliente's card statement. Appmax's length limit is unverified (08). */
const SOFT_DESCRIPTOR = 'ROBOTRADER';

/** Appmax's sandbox accepts this when no client IP is known (ADR-0007); production does not. */
const SANDBOX_FALLBACK_IP = '127.0.0.1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'boleto', 'pix'];

type PayRequest = {
	reference: string;
	lines: RawCheckoutLine[];
	method: PaymentMethod;
	buyer: unknown;
	token: string | null;
	holderName: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * A cart sends `lines: [{robot, offer, quantity}]`; the single-item form (and any older client)
 * sends `robot` + `offer`, read as a one-line cart of one unit. Only those three keys of a line
 * are read: a price smuggled into a line never reaches `priceCheckout`.
 */
function readLines(body: Record<string, unknown>): RawCheckoutLine[] | null {
	if (body.lines === undefined) {
		const robotId = nonEmptyString(body.robot);
		const offer = nonEmptyString(body.offer);
		return robotId === null || offer === null ? null : [{ robotId, offer, quantity: 1 }];
	}
	if (!Array.isArray(body.lines)) return null;
	const lines: RawCheckoutLine[] = [];
	for (const line of body.lines) {
		if (!isRecord(line)) return null;
		lines.push({ robotId: line.robot, offer: line.offer, quantity: line.quantity });
	}
	return lines;
}

function readRequest(body: unknown): PayRequest | null {
	if (!isRecord(body)) return null;
	const reference = nonEmptyString(body.reference);
	const lines = readLines(body);
	const method = PAYMENT_METHODS.find((m) => m === body.method);
	if (reference === null || !UUID.test(reference) || lines === null || method === undefined) return null;
	return {
		reference: reference.toLowerCase(),
		lines,
		method,
		buyer: body.buyer,
		token: nonEmptyString(body.token),
		holderName: nonEmptyString(body.holderName),
	};
}

/** `CF-Connecting-IP` is set by Cloudflare and cannot be forged from the browser body. */
function usableIp(ip: string | null): string | null {
	const value = ip?.trim() ?? '';
	return /^[0-9a-f.:]{2,45}$/i.test(value) && /[.:]/.test(value) ? value : null;
}

function report(message: string, extra: Record<string, unknown>): void {
	Sentry.captureMessage(`pay: ${message}`, { extra });
}

function reasonOf(failure: AppmaxFailure | { ok: false; reason: 'not_authorized' }): string {
	return failure.reason === 'rejected' ? `rejected_${failure.status}` : failure.reason;
}

const confirmationUrl = (reference: string) => `/checkout/confirmacao?ref=${reference}`;

/** Before the payment call: nothing was charged, the retry may be a new attempt. */
function unavailable(): PayResult {
	return { ok: false, status: 502, code: 'provider_unavailable', reference: crypto.randomUUID() };
}

/** After the payment call was sent: Appmax may have charged, so the retry must replay this attempt. */
function unavailableAfterPayment(): PayResult {
	return { ok: false, status: 502, code: 'provider_unavailable' };
}

export async function pay(env: PayEnv, params: { body: unknown; ip: string | null }): Promise<PayResult> {
	const limit = await env.PAY_RATE_LIMITER.limit({ key: `ip:${params.ip ?? 'unknown'}` });
	if (!limit.success) return { ok: false, status: 429, code: 'rate_limited' };

	const request = readRequest(params.body);
	if (request === null) return { ok: false, status: 400, code: 'invalid_request' };
	// Mensal needs the subscription flow of ticket 09; the catalog does not sell it (ADR-0008).
	if (request.lines.some((line) => line.offer === 'monthly')) return { ok: false, status: 400, code: 'offer_not_supported' };

	const buyerResult = normalizeBuyerInput(request.buyer);
	if (!buyerResult.ok) return { ok: false, status: 400, code: 'invalid_buyer', fieldErrors: buyerResult.fieldErrors };
	const buyer = buyerResult.buyer;

	// Every price is read from D1 here; one bad line rejects the whole cart (ADR-0006, ADR-0008).
	const priced = await priceCheckout(env, request.lines);
	if (!priced.ok) {
		const code = priced.reason === 'unknown_robot' || priced.reason === 'unknown_offer' ? 'unknown_offer' : 'invalid_request';
		return { ok: false, status: 400, code };
	}
	// One payment for the whole order: only a method every line accepts (Compra and Anual take all three).
	const allowed = priced.rows.every((row) => paymentMethodsFor(row.offer).includes(request.method));
	if (!allowed) return { ok: false, status: 400, code: 'method_not_allowed' };
	if (request.method === 'card' && request.token === null) return { ok: false, status: 400, code: 'token_required' };

	const ip = usableIp(params.ip) ?? (env.APPMAX_ENV === 'production' ? null : SANDBOX_FALLBACK_IP);
	if (ip === null) {
		report('no usable client IP in production; refused before creating anything', { reason: 'no_client_ip' });
		return { ok: false, status: 502, code: 'provider_unavailable' };
	}

	const inserted = await insertAttempt(env, { reference: request.reference, rows: priced.rows, method: request.method, buyer });
	// A repeated POST of the same attempt: it already ran (or is running), so send the Cliente
	// to its confirmation page instead of creating anything again.
	if (!inserted) return { ok: true, redirectUrl: confirmationUrl(request.reference) };

	const purchaseId = request.reference;
	const customer = await createCustomer(env, { ...buyer, ip });
	if (!customer.ok) {
		report('Appmax customer creation failed', { purchase_id: purchaseId, reason: reasonOf(customer) });
		return unavailable();
	}

	const order = await createOrder(env, { customerId: customer.customerId, products: priced.products });
	if (!order.ok) {
		report('Appmax order creation failed', { purchase_id: purchaseId, reason: reasonOf(order) });
		return unavailable();
	}

	// Every row of the checkout carries the order id before any money moves (ticket 11).
	const linked = await env.DB.prepare('UPDATE purchases SET appmax_order_id = ? WHERE checkout_id = ? AND appmax_order_id IS NULL')
		.bind(order.orderId, purchaseId)
		.run();
	if (linked.meta.changes !== priced.rows.length) {
		report('could not record the Appmax order id; payment not attempted', { purchase_id: purchaseId, order_id: order.orderId });
		return unavailable();
	}

	switch (request.method) {
		case 'card': {
			const paid = await payCreditCard(env, {
				orderId: order.orderId,
				customerId: customer.customerId,
				token: request.token as string,
				// Appmax JS reads the holder from the card form; assumed to be the buyer (08 verifies).
				holderName: request.holderName ?? `${buyer.firstName} ${buyer.lastName}`,
				holderDocument: buyer.document,
				softDescriptor: SOFT_DESCRIPTOR,
			});
			// A refused order cannot be paid again: the retry needs a fresh reference. The decline is
			// recorded so a repeated POST of this attempt lands on a page that says so (status.ts).
			if ((!paid.ok && paid.reason === 'not_authorized') || (paid.ok && paid.orderStatus.toLowerCase() === 'cancelado')) {
				await recordDecline(env, purchaseId);
				return { ok: false, status: 402, code: 'card_declined', reference: crypto.randomUUID() };
			}
			if (!paid.ok) {
				report('Appmax card payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailableAfterPayment();
			}
			break;
		}
		case 'pix': {
			const paid = await payPix(env, { orderId: order.orderId, document: buyer.document });
			if (!paid.ok) {
				report('Appmax Pix payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailableAfterPayment();
			}
			await storeInstructions(env, purchaseId, paid.pix);
			break;
		}
		case 'boleto': {
			const paid = await payBoleto(env, { orderId: order.orderId, document: buyer.document });
			if (!paid.ok) {
				report('Appmax Boleto payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailableAfterPayment();
			}
			await storeInstructions(env, purchaseId, paid.boleto);
			break;
		}
	}

	return { ok: true, redirectUrl: confirmationUrl(purchaseId) };
}

/**
 * Every row of the checkout in one `DB.batch`, which D1 runs as one transaction: the first row's
 * `id` is the reference (ticket 10) and has no `ON CONFLICT`, so a repeated POST fails on the
 * primary key and rolls back the whole group. That conflict is the idempotency signal; a retry
 * can never add rows, whatever lines it carries. `false` when the reference already has a row.
 */
async function insertAttempt(
	env: PayEnv,
	attempt: { reference: string; rows: readonly CheckoutRow[]; method: PaymentMethod; buyer: BuyerInput }
): Promise<boolean> {
	const buyerName = `${attempt.buyer.firstName} ${attempt.buyer.lastName}`;
	const statements = attempt.rows.map((row, index) =>
		env.DB.prepare(
			`INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, payment_method, buyer_name, buyer_document, checkout_id)
			 VALUES (?, ?, ?, ?, 'pending', 'appmax', ?, ?, ?, ?)`
		).bind(
			index === 0 ? attempt.reference : crypto.randomUUID(),
			row.robotId,
			row.offer,
			row.amountCents,
			attempt.method,
			buyerName,
			attempt.buyer.document,
			attempt.reference
		)
	);
	try {
		await env.DB.batch(statements);
		return true;
	} catch (error) {
		const existing = await env.DB.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(attempt.reference).first();
		if (existing !== null) return false;
		throw error;
	}
}

/** Pix and Boleto instructions go on every row of the checkout, so any row answers for the group. */
async function storeInstructions(env: PayEnv, checkoutId: string, instructions: PixInstructions | BoletoInstructions): Promise<void> {
	await env.DB.prepare('UPDATE purchases SET payment_instructions = ? WHERE checkout_id = ?')
		.bind(JSON.stringify(instructions), checkoutId)
		.run();
}

/** A refused card leaves its rows `pending`; the marker in the same column tells the page it was declined. */
async function recordDecline(env: PayEnv, checkoutId: string): Promise<void> {
	await env.DB.prepare('UPDATE purchases SET payment_instructions = ? WHERE checkout_id = ?').bind(CARD_DECLINED_MARKER, checkoutId).run();
}
