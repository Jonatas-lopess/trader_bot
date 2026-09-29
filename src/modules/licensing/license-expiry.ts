/**
 * Licença expiry, derived from purchase status in one place —
 * .scratch/catalog-pivot/issues/05-license-expiry-derivation.md, ADR-0006
 * "Purchase table and status ranking". Nothing else writes `licenses.expires_at`.
 *
 * Rules:
 *   - Compra (`one_time`): far-future sentinel, set once.
 *   - Anual: paid date + 12 months, set once (a replayed `active` must not extend it).
 *   - Mensal: paid date + 1 month, extended on each renewal, never shortened.
 *   - `canceled` / `past_due`: the term already paid stands, so no change. (Appmax cancels
 *     immediately with no end-of-period grace; "keeps the paid term" is our rule, and the
 *     expiry written at the last paid `active` event is that term.)
 *   - `refunded` / `chargeback`: now.
 *   - `pending` / `rejected`: no Licença is owed.
 */

import type { OfferName } from '../../content/catalog';
import type { PurchaseStatus } from '../billing/payment-provider';

/** Perpetual Licença (Compra). Defined once; `conta.ts` renders it as "Vitalícia". */
export const LIFETIME_EXPIRY = '9999-12-31T23:59:59.000Z';

export type LicenseExpiryChange =
	| { kind: 'none' }
	| { kind: 'set_if_unset'; at: string }
	| { kind: 'extend_to'; at: string }
	| { kind: 'end_now'; at: string };

/** UTC calendar-month addition, clamped to the last day of a shorter month (Jan 31 + 1 → Feb 28). */
function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	const day = result.getUTCDate();
	result.setUTCDate(1);
	result.setUTCMonth(result.getUTCMonth() + months);
	const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
	result.setUTCDate(Math.min(day, lastDay));
	return result;
}

export function deriveLicenseExpiry(params: { offer: OfferName; status: PurchaseStatus; now: Date }): LicenseExpiryChange {
	const { offer, status, now } = params;
	switch (status) {
		case 'active':
			if (offer === 'one_time') return { kind: 'set_if_unset', at: LIFETIME_EXPIRY };
			if (offer === 'annual') return { kind: 'set_if_unset', at: addMonths(now, 12).toISOString() };
			return { kind: 'extend_to', at: addMonths(now, 1).toISOString() };
		case 'refunded':
		case 'chargeback':
			return { kind: 'end_now', at: now.toISOString() };
		case 'pending':
		case 'rejected':
		case 'past_due':
		case 'canceled':
			return { kind: 'none' };
	}
}

type LicensingEnv = Pick<Cloudflare.Env, 'DB'>;

/**
 * The D1 statement that applies `deriveLicenseExpiry` to the Licença, for `DB.batch([...])`
 * right after the purchase status compare-and-swap so both commit together. It is guarded by
 * `purchases.status = <this status>`: when the CAS was blocked (a stale `active` arriving after
 * `refunded`), the purchase's status is not `active`, so the write is skipped and a lower-ranked
 * event cannot undo a higher one's expiry. `null` when the status never changes expiry.
 *
 * The first `active` also creates the Licença row (status defaults to `awaiting_account`). A
 * refund of a purchase that never activated creates nothing.
 */
export function licenseSyncStatement(
	env: LicensingEnv,
	params: { purchaseId: string; robotId: string; offer: OfferName; status: PurchaseStatus; now: Date }
): D1PreparedStatement | null {
	const change = deriveLicenseExpiry(params);
	if (change.kind === 'none') return null;

	const guard = 'EXISTS (SELECT 1 FROM purchases WHERE id = ? AND status = ?)';
	const touched = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

	if (change.kind === 'end_now') {
		return env.DB.prepare(`UPDATE licenses SET expires_at = ?, updated_at = ${touched} WHERE purchase_id = ? AND ${guard}`).bind(
			change.at,
			params.purchaseId,
			params.purchaseId,
			params.status
		);
	}

	const merge =
		change.kind === 'set_if_unset'
			? 'COALESCE(licenses.expires_at, excluded.expires_at)'
			: 'MAX(COALESCE(licenses.expires_at, excluded.expires_at), excluded.expires_at)';
	return env.DB.prepare(
		`INSERT INTO licenses (purchase_id, robot_id, expires_at)
		 SELECT ?, ?, ? WHERE ${guard}
		 ON CONFLICT (purchase_id) DO UPDATE SET expires_at = ${merge}, updated_at = ${touched}`
	).bind(params.purchaseId, params.robotId, change.at, params.purchaseId, params.status);
}
