/**
 * `POST /checkout/pay` (.scratch/appmax-checkout/issues/05-pay-endpoint.md, ADR-0007): the
 * own checkout form's submit. `src/pages/checkout/pay.ts` is the thin adapter around this.
 *
 * Order of the steps is a decision (spec.md "Decisions carried by the tickets"):
 *   1. rate limit by IP, then validate; the price comes from the catalog, nothing price-like in
 *      the body is read (ADR-0006);
 *   2. INSERT the provisional row with `id = reference` BEFORE calling Appmax, so a repeated
 *      POST hits the primary key and creates nothing at Appmax a second time;
 *   3. customer, order, then `appmax_order_id` on the row BEFORE the payment call, so a paid
 *      order always has a row the webhook can find (no row update, no payment);
 *   4. the payment; Pix and Boleto instructions are stored on the row for the confirmation page.
 *
 * Calls `appmax-client.ts` directly: one own-form provider exists, no second abstraction.
 * Card data never reaches this Worker, only Appmax JS's token. Nothing here logs the body,
 * the token or any buyer field; Sentry gets the purchase id and reason codes only.
 *
 * A failed attempt's row stays `pending` and inert (the confirmation page treats a stale
 * `pending` as retry-from-catalog). Every failure after the INSERT answers with a fresh
 * `reference`, so the form's retry is a new attempt rather than a replay of the dead one.
 */

import * as Sentry from '@sentry/cloudflare';
import { getPublishedBySlug, lookupOffer, type OfferName } from '../catalog/robots';
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
import { paymentMethodsFor, type PaymentMethod } from './payment-provider';

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
	robotId: string;
	offer: string;
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

function readRequest(body: unknown): PayRequest | null {
	if (!isRecord(body)) return null;
	const reference = nonEmptyString(body.reference);
	const robotId = nonEmptyString(body.robot);
	const offer = nonEmptyString(body.offer);
	const method = PAYMENT_METHODS.find((m) => m === body.method);
	if (reference === null || !UUID.test(reference) || robotId === null || offer === null || method === undefined) return null;
	return {
		reference: reference.toLowerCase(),
		robotId,
		offer,
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

function unavailable(): PayResult {
	return { ok: false, status: 502, code: 'provider_unavailable', reference: crypto.randomUUID() };
}

export async function pay(env: PayEnv, params: { body: unknown; ip: string | null }): Promise<PayResult> {
	const limit = await env.PAY_RATE_LIMITER.limit({ key: `ip:${params.ip ?? 'unknown'}` });
	if (!limit.success) return { ok: false, status: 429, code: 'rate_limited' };

	const request = readRequest(params.body);
	if (request === null) return { ok: false, status: 400, code: 'invalid_request' };
	// Mensal needs the subscription flow of ticket 09; the catalog does not sell it (ADR-0008).
	if (request.offer === 'monthly') return { ok: false, status: 400, code: 'offer_not_supported' };

	const buyerResult = normalizeBuyerInput(request.buyer);
	if (!buyerResult.ok) return { ok: false, status: 400, code: 'invalid_buyer', fieldErrors: buyerResult.fieldErrors };
	const buyer = buyerResult.buyer;

	const priced = await lookupOffer(env, request.robotId, request.offer);
	const robot = priced.kind === 'found' ? await getPublishedBySlug(env, request.robotId) : null;
	if (priced.kind !== 'found' || robot === null) return { ok: false, status: 400, code: 'unknown_offer' };
	// `found` proves `offer` is one of the Robô's own Ofertas.
	const offer = request.offer as OfferName;
	if (!paymentMethodsFor(offer).includes(request.method)) return { ok: false, status: 400, code: 'method_not_allowed' };
	if (request.method === 'card' && request.token === null) return { ok: false, status: 400, code: 'token_required' };

	const ip = usableIp(params.ip) ?? (env.APPMAX_ENV === 'production' ? null : SANDBOX_FALLBACK_IP);
	if (ip === null) {
		report('no usable client IP in production; refused before creating anything', { reason: 'no_client_ip' });
		return { ok: false, status: 502, code: 'provider_unavailable' };
	}

	const inserted = await insertAttempt(env, {
		reference: request.reference,
		robotId: request.robotId,
		offer,
		amountCents: priced.amountCents,
		method: request.method,
		buyer,
	});
	// A repeated POST of the same attempt: it already ran (or is running), so send the Cliente
	// to its confirmation page instead of creating anything again.
	if (!inserted) return { ok: true, redirectUrl: confirmationUrl(request.reference) };

	const purchaseId = request.reference;
	const customer = await createCustomer(env, { ...buyer, ip });
	if (!customer.ok) {
		report('Appmax customer creation failed', { purchase_id: purchaseId, reason: reasonOf(customer) });
		return unavailable();
	}

	const order = await createOrder(env, {
		customerId: customer.customerId,
		sku: `${request.robotId}:${offer}`,
		name: robot.name,
		amountCents: priced.amountCents,
	});
	if (!order.ok) {
		report('Appmax order creation failed', { purchase_id: purchaseId, reason: reasonOf(order) });
		return unavailable();
	}

	const linked = await env.DB.prepare('UPDATE purchases SET appmax_order_id = ? WHERE id = ? AND appmax_order_id IS NULL')
		.bind(order.orderId, purchaseId)
		.run();
	if (linked.meta.changes !== 1) {
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
			// A refused order cannot be paid again: the retry needs a fresh reference.
			if ((!paid.ok && paid.reason === 'not_authorized') || (paid.ok && paid.orderStatus.toLowerCase() === 'cancelado')) {
				return { ok: false, status: 402, code: 'card_declined', reference: crypto.randomUUID() };
			}
			if (!paid.ok) {
				report('Appmax card payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailable();
			}
			break;
		}
		case 'pix': {
			const paid = await payPix(env, { orderId: order.orderId, document: buyer.document });
			if (!paid.ok) {
				report('Appmax Pix payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailable();
			}
			await storeInstructions(env, purchaseId, paid.pix);
			break;
		}
		case 'boleto': {
			const paid = await payBoleto(env, { orderId: order.orderId, document: buyer.document });
			if (!paid.ok) {
				report('Appmax Boleto payment failed', { purchase_id: purchaseId, reason: reasonOf(paid) });
				return unavailable();
			}
			await storeInstructions(env, purchaseId, paid.boleto);
			break;
		}
	}

	return { ok: true, redirectUrl: confirmationUrl(purchaseId) };
}

/** `false` when the reference already has a row (a repeated POST). */
async function insertAttempt(
	env: PayEnv,
	attempt: { reference: string; robotId: string; offer: OfferName; amountCents: number; method: PaymentMethod; buyer: BuyerInput }
): Promise<boolean> {
	const result = await env.DB.prepare(
		`INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, payment_method, buyer_name, buyer_document, checkout_id)
		 VALUES (?1, ?2, ?3, ?4, 'pending', 'appmax', ?5, ?6, ?7, ?1)
		 ON CONFLICT (id) DO NOTHING`
	)
		.bind(
			attempt.reference,
			attempt.robotId,
			attempt.offer,
			attempt.amountCents,
			attempt.method,
			`${attempt.buyer.firstName} ${attempt.buyer.lastName}`,
			attempt.buyer.document
		)
		.run();
	return result.meta.changes === 1;
}

async function storeInstructions(env: PayEnv, purchaseId: string, instructions: PixInstructions | BoletoInstructions): Promise<void> {
	await env.DB.prepare('UPDATE purchases SET payment_instructions = ? WHERE id = ?')
		.bind(JSON.stringify(instructions), purchaseId)
		.run();
}
