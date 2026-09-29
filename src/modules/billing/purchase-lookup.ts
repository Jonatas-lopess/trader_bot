/**
 * Shared by both gateways' webhook handlers (webhook.ts for Appmax,
 * stripe-webhook.ts for Stripe) and by cancel.ts — the `provider`-scoped row
 * lookup and the rigidity-ranked CAS SQL fragment were previously
 * copy-pasted per file (code review finding: reactive per-query scoping is
 * easy to forget at a new call site). Centralized so all stay in sync by
 * construction.
 */

import type { ProviderId, PurchaseStatus } from './payment-provider';

/**
 * Purchase status ranking (PLANNING.md §6, ADR-0006): a lower-ranked event
 * never overwrites a higher one. Chargeback outranks refund because it is
 * adversarial and cannot be un-disputed. Mirrors the `status` CHECK in
 * migrations/0008_catalog_pivot.sql.
 */
export const STATUS_RIGIDITY: Record<PurchaseStatus, number> = {
	pending: 0,
	rejected: 1,
	active: 2,
	past_due: 3,
	canceled: 4,
	refunded: 5,
	chargeback: 6,
};

// Built from STATUS_RIGIDITY so the SQL and the TypeScript ranking cannot drift.
export const STATUS_RIGIDITY_CASE_SQL = `CASE status ${(
	Object.entries(STATUS_RIGIDITY) as [PurchaseStatus, number][]
)
	.map(([status, rank]) => `WHEN '${status}' THEN ${rank}`)
	.join(' ')} END`;

type LookupEnv = Pick<Cloudflare.Env, 'DB'>;

/** `provider`-scoped so a Stripe id can never cross-match an Appmax row or vice versa (defense-in-depth; the two gateways' id formats don't collide in practice). */
export async function findPurchaseIdByProviderRef(
	env: LookupEnv,
	provider: ProviderId,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<string | null> {
	const row = await env.DB.prepare(
		'SELECT id FROM purchases WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?) LIMIT 1'
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.first<{ id: string }>();
	return row?.id ?? null;
}
