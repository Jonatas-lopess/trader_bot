/**
 * Customer-initiated cancellation — .scratch/customer-area/issues/04-cancel-subscription.md.
 *
 * Calls Appmax's cancel API, then applies the exact same rigidity-ranked
 * compare-and-swap `UPDATE` `webhook.ts` uses against `subscriptions.status`
 * (User Story 12) — one atomic statement, no prior `SELECT`, so this write
 * path and the webhook's share one state-transition rule instead of two
 * that could disagree. Never touches `licenses`: Assinatura and Licença are
 * independent lifecycles (User Story 11, CONTEXT.md).
 */

import { cancelSubscription as cancelAtAppmax } from './appmax-client';

type CancelEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'>;

export type CancelSubscriptionResult =
	| { ok: true }
	| { ok: false; reason: 'appmax_unavailable' | 'no_appmax_subscription_id' };

export async function cancelSubscription(
	env: CancelEnv,
	params: { subscriptionId: string; appmaxSubscriptionId: string | null }
): Promise<CancelSubscriptionResult> {
	if (params.appmaxSubscriptionId === null) {
		return { ok: false, reason: 'no_appmax_subscription_id' };
	}

	const appmaxResult = await cancelAtAppmax(env, params.appmaxSubscriptionId);
	if (!appmaxResult.ok) return { ok: false, reason: 'appmax_unavailable' };

	// The rigidity check (`<= 3`) is trivially true for every status since
	// `canceled` is the most rigid state — that's intentional, not a no-op
	// bug: cancellation is always immediate (spec.md's Implementation
	// Decisions), so this CAS's job isn't to block the transition, only to
	// make the write atomic and share webhook.ts's own ranking rather than a
	// second, potentially-diverging rule. `meta.changes` is deliberately
	// unchecked below: cancelling an already-`canceled` subscription is a
	// no-op success from the Cliente's point of view, not an error.
	await env.DB.prepare(
		`UPDATE subscriptions
		 SET status = 'canceled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE id = ?
		   AND CASE status
		         WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'past_due' THEN 2 WHEN 'canceled' THEN 3
		       END <= 3`
	)
		.bind(params.subscriptionId)
		.run();

	return { ok: true };
}
