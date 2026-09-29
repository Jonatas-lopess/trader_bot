/**
 * `/checkout?robot=<slug>&offer=<offer>` (catalog-pivot ticket 03, ADR-0006
 * "Server-side price"): resolves the price from the catalog, writes the
 * provisional D1 row (User Story 14 — no Cliente identity, PLANNING.md §7),
 * and returns the URL to redirect the Cliente to. `src/pages/checkout.ts` is
 * the thin Astro adapter around this.
 *
 * The client supplies only `robotId` + `offer`. Nothing else it sends is read,
 * so a tampered price cannot reach the gateway or the `amount_cents` the
 * webhook later compares against (PLANNING.md §6 "Price integrity").
 */

import { lookupOffer, type OfferName } from '../../content/catalog';
import { getCustomerEmail } from '../identity/customers';
import { selectProvider } from './factory';
import { paymentMethodsFor } from './payment-provider';

export type CheckoutSessionResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; status: 400; message: string }
	| { ok: false; status: 409; message: string }
	| { ok: false; status: 502; message: string };

type CheckoutEnv = Pick<
	Cloudflare.Env,
	'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY' | 'PAYMENT_PROVIDER'
>;

/**
 * One active Licença per Cliente per Robô (ADR-0006). Only `active` purchases
 * count: a `pending` row from an abandoned or declined attempt must never block
 * a new checkout. A purchase is tied to a Cliente by email, since each
 * provisioning writes its own `customers` row (migrations/0008).
 */
async function hasActivePurchase(env: Pick<Cloudflare.Env, 'DB'>, customerId: string, robotId: string): Promise<boolean> {
	const email = await getCustomerEmail(env, customerId);
	if (email === null) return false;
	const row = await env.DB.prepare(
		"SELECT 1 FROM purchases p JOIN customers c ON c.purchase_id = p.id WHERE c.email = ? AND p.robot_id = ? AND p.status = 'active' LIMIT 1"
	)
		.bind(email, robotId)
		.first();
	return row !== null;
}

export async function createCheckoutSession(
	env: CheckoutEnv,
	params: {
		robotId: string | null;
		offer: string | null;
		origin: string;
		/** The authenticated Cliente, when the request carries a session; guests are checked at provisioning instead (PLANNING §7). */
		customerId?: string | null;
	}
): Promise<CheckoutSessionResult> {
	const priced =
		params.robotId === null || params.offer === null ? null : lookupOffer(params.robotId, params.offer);
	if (priced === null || priced.kind !== 'found') {
		return { ok: false, status: 400, message: 'Unknown or missing robot or offer.' };
	}
	const { robotId } = params as { robotId: string };
	// `found` proves `offer` is one of the robot's own OfferName keys.
	const offer = params.offer as OfferName;
	const amountCents = priced.amountCents;

	if (params.customerId && (await hasActivePurchase(env, params.customerId, robotId))) {
		return { ok: false, status: 409, message: 'You already have an active license for this robot.' };
	}

	const reference = crypto.randomUUID();
	const returnUrl = new URL(`/checkout/confirmacao?ref=${reference}`, params.origin).toString();
	// Back to where the Cliente started, not the success confirmation page
	// (code review finding: reusing returnUrl as cancel_url made an abandoned
	// Stripe checkout indistinguishable on-screen from a successful one).
	const cancelUrl = params.origin;

	const provider = selectProvider(env);
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
		return {
			ok: false,
			status: 502,
			message: 'Payment provider unavailable, try again shortly.',
		};
	}

	// Written before the redirect (spec.md's "Provisional record") — the
	// webhook (ticket 04) finds this row later by appmax_order_id/
	// appmax_subscription_id, or by `reference` itself if Appmax's
	// `external_id` turns out to round-trip (appmax-client.ts's header).
	// `provider` records which gateway's ids those two columns hold
	// (docs/adr/0005-stripe-test-driver.md) — defaults to `appmax` in the
	// schema, written explicitly here so a Stripe test session is never
	// mistaken for one. `amount_cents` is the price we asked the gateway to
	// charge; the webhook compares the gateway's reported amount against it.
	await env.DB.prepare(
		'INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
	)
		.bind(reference, robotId, offer, amountCents, 'pending', provider.id, session.providerOrderId)
		.run();

	return { ok: true, redirectUrl: session.checkoutUrl };
}
