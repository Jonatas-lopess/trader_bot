/**
 * `/checkout?robot=<slug>&offer=<offer>` (catalog-pivot ticket 03, ADR-0006 "Server-side
 * price", ADR-0007 own checkout) and its cart form `/checkout?line=<slug>:<offer>:<qty>&line=...`
 * (storefront-v2 11, ADR-0008): validates the lines, prices them from the D1 catalog and says
 * what the page does next. A single item is a one-line cart of one unit. `src/pages/checkout.astro`
 * is the thin adapter around this.
 *
 * - A redirect provider (Stripe's test driver) gets its session created, the provisional row
 *   written (PLANNING.md §7, no Cliente identity yet) and a URL to redirect to.
 * - An own-form provider (Appmax) gets the data our form needs and a fresh `reference` per
 *   render. No row is written here: the pay endpoint (`pay.ts`) writes it with
 *   `id = reference` when the Cliente submits.
 * - Mensal on an own-form provider is `unavailable` until the own-form recurrence exists
 *   (appmax-checkout 09); the catalog does not sell it anyway (ADR-0008 standby).
 *
 * The client supplies only `robotId` + `offer`. Nothing else it sends is read, so a tampered
 * price cannot reach the gateway, the form or the `amount_cents` the webhook later compares
 * against (PLANNING.md §6 "Price integrity").
 *
 * No check against a Licença the Cliente already holds: buying the same Robô again is how a
 * second Corretora account gets its own Licença (ADR-0008).
 */

import { getPublishedBySlug, type OfferName } from '../catalog/robots';
import { selectProvider } from './factory';
import { paymentMethodsFor, type PaymentMethod } from './payment-provider';
import { priceCheckout, type RawCheckoutLine } from './price-checkout';

export type CheckoutError =
	| { kind: 'error'; status: 400; message: string }
	| { kind: 'error'; status: 502; message: string };

/** One line of the order summary, priced from D1. */
export type CheckoutFormLine = { robotId: string; robotName: string; offer: OfferName; quantity: number; unitCents: number };

export type CheckoutForm = {
	kind: 'form';
	lines: CheckoutFormLine[];
	/** The order total. */
	amountCents: number;
	/** Methods every line accepts: one payment covers the whole order. */
	methods: PaymentMethod[];
	/** Becomes the checkout id (and the first row's `purchases.id`) when the form is paid; minted per render. */
	reference: string;
	/** Came from the cart page, so the page empties the cart after a successful pay. */
	fromCart: boolean;
};

export type ResolveCheckoutResult =
	| { kind: 'redirect'; redirectUrl: string }
	| CheckoutForm
	| { kind: 'unavailable'; reason: 'offer_not_supported' | 'cart_not_supported' }
	| CheckoutError;

/** `lines` is the cart form (`line` params); `null` (or absent) is the single-item form. */
export type CheckoutQuery = { robotId: string | null; offer: string | null; lines?: RawCheckoutLine[] | null; origin: string };

type CheckoutEnv = Pick<
	Cloudflare.Env,
	'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY' | 'PAYMENT_PROVIDER'
>;

const UNKNOWN: CheckoutError = { kind: 'error', status: 400, message: 'Unknown or missing robot or offer.' };

/** A cart line in the URL: `<robot>:<offer>:<quantity>`. Malformed parts are passed on for `priceCheckout` to reject. */
function readLine(value: string): RawCheckoutLine {
	const [robotId, offer, quantity] = value.split(':');
	return { robotId, offer: offer ?? null, quantity: Number(quantity) };
}

/**
 * Only `robot` + `offer`, or the cart's `line` params, are read from the URL; any price-like
 * param is ignored (ADR-0006).
 */
export function readCheckoutQuery(url: URL): CheckoutQuery {
	const lines = url.searchParams.getAll('line');
	return {
		robotId: url.searchParams.get('robot'),
		offer: url.searchParams.get('offer'),
		lines: lines.length === 0 ? null : lines.map(readLine),
		origin: url.origin,
	};
}

export async function resolveCheckout(env: CheckoutEnv, params: CheckoutQuery): Promise<ResolveCheckoutResult> {
	const fromCart = params.lines != null;
	const lines: RawCheckoutLine[] | null =
		params.lines ?? (params.robotId === null || params.offer === null ? null : [{ robotId: params.robotId, offer: params.offer, quantity: 1 }]);
	if (lines === null) return UNKNOWN;
	const provider = selectProvider(env);

	if (provider.checkout === 'own-form' && lines.some((line) => line.offer === 'monthly')) {
		if (fromCart) return { kind: 'unavailable', reason: 'offer_not_supported' };
		return (await getPublishedBySlug(env, String(lines[0].robotId))) === null ? UNKNOWN : { kind: 'unavailable', reason: 'offer_not_supported' };
	}

	const priced = await priceCheckout(env, lines);
	if (!priced.ok) return UNKNOWN;
	const reference = crypto.randomUUID();
	const methods = (['card', 'boleto', 'pix'] as const).filter((method) =>
		priced.lines.every((line) => paymentMethodsFor(line.offer).includes(method))
	);

	if (provider.checkout === 'own-form') {
		return {
			kind: 'form',
			lines: priced.lines.map(({ robotId, name, offer, quantity, unitCents }) => ({ robotId, robotName: name, offer, quantity, unitCents })),
			amountCents: priced.totalCents,
			methods,
			reference,
			fromCart,
		};
	}

	// The Stripe test driver (ADR-0005) takes one item per session; carts ride on Appmax only.
	if (priced.rows.length !== 1) return { kind: 'unavailable', reason: 'cart_not_supported' };
	const [{ robotId, offer, amountCents }] = priced.rows;

	const returnUrl = new URL(`/checkout/confirmacao?ref=${reference}`, params.origin).toString();
	// Back to where the Cliente started, not the success confirmation page
	// (code review finding: reusing returnUrl as cancel_url made an abandoned
	// Stripe checkout indistinguishable on-screen from a successful one).
	const cancelUrl = params.origin;

	const session = await provider.createCheckoutSession(env, {
		reference,
		robotId,
		offer,
		amountCents,
		allowedMethods: paymentMethodsFor(offer),
		returnUrl,
		cancelUrl,
	});
	if (!session.ok) {
		return { kind: 'error', status: 502, message: 'Payment provider unavailable, try again shortly.' };
	}

	// Written before the redirect (spec.md's "Provisional record"); the webhook finds it
	// later by the provider's id held in `appmax_order_id`. `provider` records which
	// gateway's ids that column holds (docs/adr/0005-stripe-test-driver.md), so a Stripe
	// test session is never mistaken for an Appmax order. `amount_cents` is the price we
	// asked the gateway to charge; the webhook compares the reported amount against it.
	await env.DB.prepare(
		'INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
	)
		.bind(reference, robotId, offer, amountCents, 'pending', provider.id, session.providerOrderId)
		.run();

	return { kind: 'redirect', redirectUrl: session.checkoutUrl };
}
