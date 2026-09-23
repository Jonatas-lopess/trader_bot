/**
 * `/checkout?plan=<id>` (spec.md's "Checkout session creation"): resolves
 * the Plano, writes the provisional D1 row (User Story 14 — no Cliente
 * identity, PLANNING.md §7), and returns the URL to redirect the Cliente
 * to. `src/pages/checkout.ts` is the thin Astro adapter around this.
 */

import { plans, type PlanId } from '../../content/plans';
import { createHostedCheckoutSession } from './appmax-client';

export type CheckoutSessionResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; status: 400; message: string }
	| { ok: false; status: 502; message: string };

const planIds = new Set<PlanId>(plans.map((plan) => plan.id));

function isPlanId(value: string | null): value is PlanId {
	return value !== null && planIds.has(value as PlanId);
}

type CheckoutEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'>;

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

	const session = await createHostedCheckoutSession(env, {
		reference,
		planId: plan.id,
		amountCents: Math.round(plan.price.monthly * 100),
		returnUrl,
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
	await env.DB.prepare(
		'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id) VALUES (?, ?, ?, ?)'
	)
		.bind(reference, plan.id, 'pending', session.appmaxOrderId)
		.run();

	return { ok: true, redirectUrl: session.checkoutUrl };
}
