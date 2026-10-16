/**
 * Shared by both gateways' webhook handlers (webhook.ts for Appmax,
 * stripe-webhook.ts for Stripe) and by cancel.ts — the `provider`-scoped row
 * lookup and the rigidity-ranked CAS SQL fragment were previously
 * copy-pasted per file (code review finding: reactive per-query scoping is
 * easy to forget at a new call site). Centralized so all stay in sync by
 * construction.
 */

import * as Sentry from '@sentry/cloudflare';
import type { PurchaseOffer } from '../catalog/robots';
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

/** First time the purchase lands `active`, for the manual NFS-e (ticket 13); one `?` = the new status. */
export const PAID_AT_SQL = `CASE WHEN ? = 'active' THEN COALESCE(paid_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE paid_at END`;

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

/**
 * Immutable facts of every purchase row the gateway reference matches, oldest first: the rows of
 * one order (a cart is one row per Licença sharing `appmax_order_id`, ADR-0008). The Licença sync
 * (`licenseSyncStatement`) needs them before the status CAS so both can share one `DB.batch`.
 */
export async function findPurchasesByProviderRef(
	env: LookupEnv,
	provider: ProviderId,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<{ id: string; robotId: string; offer: PurchaseOffer }[]> {
	const { results } = await env.DB.prepare(
		'SELECT id, robot_id, offer FROM purchases WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?) ORDER BY created_at, id'
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.all<{ id: string; robot_id: string; offer: PurchaseOffer }>();
	return results.map((row) => ({ id: row.id, robotId: row.robot_id, offer: row.offer }));
}

export type CheckoutPurchase = {
	id: string;
	robotId: string;
	offer: PurchaseOffer;
	amountCents: number;
	status: PurchaseStatus;
	paymentMethod: string | null;
	/** Raw JSON text of `purchases.payment_instructions` (migration 0016); untrusted, parsed by `status.ts`. */
	paymentInstructions: string | null;
};

/**
 * Every purchase row of a checkout (ADR-0008), oldest first. Rows share `checkout_id`; a row
 * written before migration 0013 or by code that does not set it still answers for itself when
 * `checkoutId` is its `id`. Empty for an unknown id.
 */
export async function findByCheckout(env: LookupEnv, checkoutId: string): Promise<CheckoutPurchase[]> {
	const { results } = await env.DB.prepare(
		`SELECT id, robot_id, offer, amount_cents, status, payment_method, payment_instructions FROM purchases
		WHERE checkout_id = ?1 OR (checkout_id IS NULL AND id = ?1)
		ORDER BY created_at, id`
	)
		.bind(checkoutId)
		.all<{
			id: string;
			robot_id: string;
			offer: PurchaseOffer;
			amount_cents: number;
			status: PurchaseStatus;
			payment_method: string | null;
			payment_instructions: string | null;
		}>();
	return results.map((row) => ({
		id: row.id,
		robotId: row.robot_id,
		offer: row.offer,
		amountCents: row.amount_cents,
		status: row.status,
		paymentMethod: row.payment_method,
		paymentInstructions: row.payment_instructions,
	}));
}

/** `purchaseId` is the order's checkout id (its first row's id); `expectedCents` the sum over its `rows` rows. */
type AmountFacts = { purchaseId: string; orderId: string | null; rows: number; expectedCents: number };

export type AmountCheck =
	| { status: PurchaseStatus; unchecked?: AmountFacts }
	| { status: 'rejected'; mismatch: AmountFacts & { reportedCents: number } };

/**
 * Price integrity after payment (ADR-0006, PLANNING.md §6): when the authoritative refetch
 * says a purchase is paid (`active`), the amount the gateway reports must equal the stored
 * `amount_cents`, summed over every row of the order (ADR-0008: a cart is one row per Licença
 * sharing the order id; a single purchase is a group of one). Never the live catalog, so repricing between session creation and
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

	const group = await env.DB.prepare(
		`SELECT MIN(COALESCE(checkout_id, id)) AS id, COUNT(*) AS row_count, SUM(amount_cents) AS expected FROM purchases
		 WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?)`
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.first<{ id: string | null; row_count: number; expected: number | null }>();
	if (group === null || group.id === null || group.expected === null) return { status: 'active' };

	const facts = { purchaseId: group.id, orderId: ref.orderId, rows: group.row_count, expectedCents: group.expected };
	if (authoritative.reportedAmountCents === null) return { status: 'active', unchecked: facts };
	if (authoritative.reportedAmountCents === group.expected) return { status: 'active' };
	return { status: 'rejected', mismatch: { ...facts, reportedCents: authoritative.reportedAmountCents } };
}

/** Sentry reports for an `AmountCheck`. Call only once the CAS actually applied, so a stale or replayed event does not re-report. */
export function reportAmountCheck(provider: ProviderId, checked: AmountCheck): void {
	if ('mismatch' in checked) {
		const { purchaseId, orderId, rows, expectedCents, reportedCents } = checked.mismatch;
		Sentry.captureMessage('amount mismatch: payment received but reported amount differs from the stored expectation', {
			level: 'error',
			extra: { provider, purchase_id: purchaseId, order_id: orderId, rows, expected_cents: expectedCents, reported_cents: reportedCents },
		});
	} else if (checked.unchecked !== undefined) {
		const { purchaseId, orderId, rows, expectedCents } = checked.unchecked;
		Sentry.captureMessage('no reported amount on the authoritative response; activated unchecked', {
			extra: { provider, purchase_id: purchaseId, order_id: orderId, rows, expected_cents: expectedCents },
		});
	}
}

/**
 * Ticket 13: an `active` purchase with no buyer document cannot be invoiced from D1 alone.
 * Money already moved, so this only reports, with the purchase id and provider, never the
 * name or document (LGPD). Reads the stored column after the CAS, so a later event whose
 * refetch carries no customer (a subscription renewal) does not re-report once it is filled.
 */
export async function reportMissingBuyerDocument(
	env: LookupEnv,
	provider: ProviderId,
	ref: { orderId: string | null; subscriptionId: string | null }
): Promise<void> {
	// Every row of an order carries the buyer fields (pay.ts copies them), so one missing row is enough to report.
	const row = await env.DB.prepare(
		'SELECT id FROM purchases WHERE provider = ? AND (appmax_order_id = ? OR appmax_subscription_id = ?) AND buyer_document IS NULL ORDER BY created_at, id LIMIT 1'
	)
		.bind(provider, ref.orderId, ref.subscriptionId)
		.first<{ id: string }>();
	if (row === null) return;
	Sentry.captureMessage('no buyer document on the authoritative response; NFS-e needs it entered by hand', {
		extra: { provider, purchase_id: row.id },
	});
}
