/**
 * Customer-initiated cancellation — .scratch/customer-area/issues/04-cancel-subscription.md.
 *
 * Calls the owning gateway's cancel API — `providerById` (factory.ts),
 * dispatched on the subscription row's own recorded `provider`, not the
 * current `PAYMENT_PROVIDER` env default (docs/adr/0005-stripe-test-driver.md;
 * a Stripe test subscription must not have its cancel routed to Appmax) —
 * then applies the exact same rigidity-ranked compare-and-swap `UPDATE`
 * `webhook.ts` uses against `subscriptions.status` (User Story 12) — one
 * atomic statement, no prior `SELECT`, so this write path and the webhook's
 * share one state-transition rule instead of two that could disagree.
 * Never touches `licenses`: Assinatura and Licença are independent
 * lifecycles (User Story 11, CONTEXT.md).
 */

import { providerById } from './factory';
import type { ProviderId } from './payment-provider';
import { STATUS_RIGIDITY, STATUS_RIGIDITY_CASE_SQL } from './purchase-lookup';

type CancelEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'STRIPE_SECRET_KEY'>;

export type CancelSubscriptionResult =
	| { ok: true }
	| { ok: false; reason: 'provider_unavailable' | 'no_provider_subscription_id' };

export async function cancelSubscription(
	env: CancelEnv,
	params: { purchaseId: string; provider: ProviderId; providerSubscriptionId: string | null }
): Promise<CancelSubscriptionResult> {
	if (params.providerSubscriptionId === null) {
		return { ok: false, reason: 'no_provider_subscription_id' };
	}

	const result = await providerById(params.provider).cancelSubscription(env, params.providerSubscriptionId);
	if (!result.ok) return { ok: false, reason: 'provider_unavailable' };

	// Same rigidity-ranked CAS as the webhooks (STATUS_RIGIDITY_CASE_SQL), so
	// this write and theirs share one state-transition rule. A `refunded` or
	// `chargeback` purchase outranks `canceled` and is never overwritten by a
	// late cancel. `meta.changes` is deliberately unchecked below: cancelling
	// an already-`canceled` (or higher) purchase is a no-op success from the
	// Cliente's point of view, not an error.
	await env.DB.prepare(
		`UPDATE purchases
		 SET status = 'canceled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE id = ?
		   AND ${STATUS_RIGIDITY_CASE_SQL} <= ?`
	)
		.bind(params.purchaseId, STATUS_RIGIDITY.canceled)
		.run();

	return { ok: true };
}
