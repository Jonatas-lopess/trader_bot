/**
 * Shared by both gateways' webhook handlers (webhook.ts for Appmax,
 * stripe-webhook.ts for Stripe) and by cancel.ts — the `provider`-scoped row
 * lookup and the rigidity-ranked CAS SQL fragment were previously
 * copy-pasted per file (code review finding: reactive per-query scoping is
 * easy to forget at a new call site). Centralized so all stay in sync by
 * construction.
 */

import * as Sentry from '@sentry/cloudflare';
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

type AmountFacts = { purchaseId: string; expectedCents: number };

export type AmountCheck =
	| { status: PurchaseStatus; unchecked?: AmountFacts }
	| { status: 'rejected'; mismatch: AmountFacts & { reportedCents: number } };

/**
 * Price integrity after payment (ADR-0006, PLANNING.md §6): when the authoritative refetch
 * says a purchase is paid (`active`), the amount the gateway reports must equal the row's
 * stored `amount_cents`. Never the live catalog, so repricing between session creation and
 * payment cannot flag a legitimate payment. A mismatch downgrades the outcome to `rejected`;
 * the Cliente was charged, so the caller reports it (`reportAmountCheck`) and never provisions.
 *
 * `reportedAmountCents === null` (the gateway response carried no amount, a field name still
 * unverified against a sandbox) activates anyway and is flagged `unchecked`, rather than
 * rejecting every payment because of an unconfirmed field name.
 */
export async function checkReportedAmount(
	env: LookupEnv,
	provider: ProviderId,
	ref: { orderId: string | null; subscriptionId: string | null },
	authoritative: { status: PurchaseStatus; reportedAmountCents: number | null }
): Promise<AmountCheck> {
	if (authoritative.status !== 'active') return { status: authoritative.status };

	const row = await env.DB.prepare(
		'SELECT id, amount_cents FROM purchases WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?) LIMIT 1'
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.first<{ id: string; amount_cents: number }>();
	if (row === null) return { status: 'active' };

	const facts = { purchaseId: row.id, expectedCents: row.amount_cents };
	if (authoritative.reportedAmountCents === null) return { status: 'active', unchecked: facts };
	if (authoritative.reportedAmountCents === row.amount_cents) return { status: 'active' };
	return { status: 'rejected', mismatch: { ...facts, reportedCents: authoritative.reportedAmountCents } };
}

/** Sentry reports for an `AmountCheck`. Call only once the CAS actually applied, so a stale or replayed event does not re-report. */
export function reportAmountCheck(provider: ProviderId, checked: AmountCheck): void {
	if ('mismatch' in checked) {
		const { purchaseId, expectedCents, reportedCents } = checked.mismatch;
		Sentry.captureMessage('amount mismatch: payment received but reported amount differs from the stored expectation', {
			level: 'error',
			extra: { provider, purchase_id: purchaseId, expected_cents: expectedCents, reported_cents: reportedCents },
		});
	} else if (checked.unchecked !== undefined) {
		Sentry.captureMessage('no reported amount on the authoritative response; activated unchecked', {
			extra: { provider, purchase_id: checked.unchecked.purchaseId, expected_cents: checked.unchecked.expectedCents },
		});
	}
}
