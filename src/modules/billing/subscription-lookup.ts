/**
 * Shared by both gateways' webhook handlers (webhook.ts for Appmax,
 * stripe-webhook.ts for Stripe) — the `provider`-scoped row lookup and the
 * rigidity-ranked CAS SQL fragment were previously copy-pasted per file
 * (code review finding: reactive per-query scoping is easy to forget at a
 * new call site). Centralized so both stay in sync by construction.
 */

import type { ProviderId, SubscriptionState } from './payment-provider';

export const STATUS_RIGIDITY: Record<SubscriptionState, number> = {
	pending: 0,
	active: 1,
	past_due: 2,
	canceled: 3,
};

export const STATUS_RIGIDITY_CASE_SQL = `CASE status
	         WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'past_due' THEN 2 WHEN 'canceled' THEN 3
	       END`;

type LookupEnv = Pick<Cloudflare.Env, 'DB'>;

/** `provider`-scoped so a Stripe id can never cross-match an Appmax row or vice versa (defense-in-depth; the two gateways' id formats don't collide in practice). */
export async function findSubscriptionIdByProviderRef(
	env: LookupEnv,
	provider: ProviderId,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<string | null> {
	const row = await env.DB.prepare(
		'SELECT id FROM subscriptions WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?) LIMIT 1'
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.first<{ id: string }>();
	return row?.id ?? null;
}
