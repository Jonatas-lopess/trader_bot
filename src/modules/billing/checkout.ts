/**
 * `/checkout?plan=<id>` (spec.md's "Checkout session creation"): resolves
 * the Plano, writes the provisional D1 row (User Story 14 — no Cliente
 * identity, PLANNING.md §7), and returns the URL to redirect the Cliente
 * to. `src/pages/checkout.ts` is the thin Astro adapter around this.
 */

import { plans, type PlanId } from '../../content/plans';
import { selectProvider } from './factory';

export type CheckoutSessionResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; status: 400; message: string }
	| { ok: false; status: 502; message: string };

const planIds = new Set<PlanId>(plans.map((plan) => plan.id));

function isPlanId(value: string | null): value is PlanId {
	return value !== null && planIds.has(value as PlanId);
}

type CheckoutEnv = Pick<
	Cloudflare.Env,
	'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY' | 'PAYMENT_PROVIDER'
>;

export async function createCheckoutSession(
	env: CheckoutEnv,
	params: { planId: string | null; origin: string }
): Promise<CheckoutSessionResult> {
	if (!isPlanId(params.planId)) {
		return { ok: false, status: 400, message: 'Unknown or missing plan.' };
	}
	// Annual is out of scope (spec.md's Out of Scope — no annual price set
	// anywhere yet, src/content/plans.ts); always the monthly price.
	const plan = plans.find((candidate) => candidate.id === params.planId)!;
	const reference = crypto.randomUUID();
	const returnUrl = new URL(`/checkout/confirmacao?ref=${reference}`, params.origin).toString();
	// Back to where the Cliente started, not the success confirmation page
	// (code review finding: reusing returnUrl as cancel_url made an abandoned
	// Stripe checkout indistinguishable on-screen from a successful one).
	const cancelUrl = params.origin;

	const provider = selectProvider(env);
	const session = await provider.createCheckoutSession(env, {
		reference,
		planId: plan.id,
		amountCents: Math.round(plan.price.monthly * 100),
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
	// mistaken for one.
	// Interim bridge until catalog-pivot ticket 03 replaces the Plano lookup
	// with `robot_id` + `offer` from src/content/catalog.ts: the plan id
	// stands in for `robot_id` and the monthly price for the amount (ticket 04's
	// amount check must not ship before this bridge is gone).
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, 'monthly', ?, ?, ?, ?)"
	)
		.bind(reference, plan.id, Math.round(plan.price.monthly * 100), 'pending', provider.id, session.providerOrderId)
		.run();

	return { ok: true, redirectUrl: session.checkoutUrl };
}
