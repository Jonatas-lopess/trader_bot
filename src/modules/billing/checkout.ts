/**
 * `/checkout?robot=<slug>&offer=<offer>` (catalog-pivot ticket 03, ADR-0006 "Server-side
 * price", ADR-0007 own checkout): validates the Robô and Oferta, prices them from the D1
 * catalog (ADR-0008) and says what the page does next. `src/pages/checkout.astro` is the thin
 * adapter around this.
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

import { getPublishedBySlug, lookupOffer, type OfferName } from '../catalog/robots';
import { selectProvider } from './factory';
import { paymentMethodsFor, type PaymentMethod } from './payment-provider';

export type CheckoutError =
	| { kind: 'error'; status: 400; message: string }
	| { kind: 'error'; status: 502; message: string };

export type CheckoutForm = {
	kind: 'form';
	robotId: string;
	robotName: string;
	offer: OfferName;
	amountCents: number;
	methods: PaymentMethod[];
	/** Becomes `purchases.id` when the form is paid; minted per render. */
	reference: string;
};

export type ResolveCheckoutResult =
	| { kind: 'redirect'; redirectUrl: string }
	| CheckoutForm
	| { kind: 'unavailable'; reason: 'offer_not_supported' }
	| CheckoutError;

export type CheckoutQuery = { robotId: string | null; offer: string | null; origin: string };

type CheckoutEnv = Pick<
	Cloudflare.Env,
	'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY' | 'PAYMENT_PROVIDER'
>;

const UNKNOWN: CheckoutError = { kind: 'error', status: 400, message: 'Unknown or missing robot or offer.' };

/** Only `robot` + `offer` are read from the URL; any price-like param is ignored (ADR-0006). */
export function readCheckoutQuery(url: URL): CheckoutQuery {
	return { robotId: url.searchParams.get('robot'), offer: url.searchParams.get('offer'), origin: url.origin };
}

export async function resolveCheckout(env: CheckoutEnv, params: CheckoutQuery): Promise<ResolveCheckoutResult> {
	if (params.robotId === null || params.offer === null) return UNKNOWN;
	const robotId = params.robotId;
	const provider = selectProvider(env);

	if (provider.checkout === 'own-form' && params.offer === 'monthly') {
		return (await getPublishedBySlug(env, robotId)) === null ? UNKNOWN : { kind: 'unavailable', reason: 'offer_not_supported' };
	}

	const priced = await lookupOffer(env, robotId, params.offer);
	if (priced.kind !== 'found') return UNKNOWN;
	// `found` proves `offer` is one of the robot's own OfferName keys.
	const offer = params.offer as OfferName;
	const amountCents = priced.amountCents;
	const reference = crypto.randomUUID();

	if (provider.checkout === 'own-form') {
		const robot = await getPublishedBySlug(env, robotId);
		if (robot === null) return UNKNOWN;
		return {
			kind: 'form',
			robotId,
			robotName: robot.name,
			offer,
			amountCents,
			methods: paymentMethodsFor(offer),
			reference,
		};
	}

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
