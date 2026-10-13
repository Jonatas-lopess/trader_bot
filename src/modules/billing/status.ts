/**
 * The intermediate confirmation page's poll target (spec.md's "Status
 * endpoint", ~2s interval, no WebSocket/Durable Object — PLANNING.md §7).
 */

import type { PurchaseStatus } from './payment-provider';
import { findByCheckout, STATUS_RIGIDITY } from './purchase-lookup';

type StatusEnv = Pick<Cloudflare.Env, 'DB'>;

export type PurchaseState = PurchaseStatus | 'awaiting_boleto';

export type PurchaseStatusResult =
	| { ok: true; state: PurchaseState }
	| { ok: false; status: 404 };

type CheckoutStatusRow = { status: PurchaseStatus; paymentMethod: string | null };

/**
 * One state for the rows of a checkout (ADR-0008: one row per Licença, the rows of an order
 * move together). Ordered by the ranking of ADR-0006 / `STATUS_RIGIDITY`, with the unpaid
 * states taking precedence because the confirmation page can only act on those:
 * - any `rejected` row: `rejected` (paid but held for review, the operator must look);
 * - else any `pending` row: `pending` (`awaiting_boleto` for a boleto): not everything is paid yet;
 * - else every row is past payment, so the highest-ranked status wins and a single refunded
 *   or charged-back Licença is not hidden behind its `active` siblings.
 * A one-row checkout returns its own status, so single purchases behave as they always did.
 * `null` for no rows.
 */
export function aggregateCheckoutStatus(rows: readonly CheckoutStatusRow[]): PurchaseState | null {
	if (rows.length === 0) return null;
	if (rows.some((row) => row.status === 'rejected')) return 'rejected';
	const pending = rows.find((row) => row.status === 'pending');
	if (pending !== undefined) return pending.paymentMethod === 'boleto' ? 'awaiting_boleto' : 'pending';
	return rows.reduce((top, row) => (STATUS_RIGIDITY[row.status] > STATUS_RIGIDITY[top] ? row.status : top), rows[0].status);
}

/** `reference` is the `checkout_id` (equal to the first row's `id`), so a single purchase answers for itself. */
export async function getPurchaseStatus(
	env: StatusEnv,
	reference: string | null
): Promise<PurchaseStatusResult> {
	if (reference === null || reference === '') return { ok: false, status: 404 };

	// Boleto's "confirmação em até 1 dia útil" (User Story 4) is a distinct
	// state from generic pending, not a status column value of its own —
	// the underlying rows stay `pending` until the webhook confirms them.
	const state = aggregateCheckoutStatus(await findByCheckout(env, reference));
	if (state === null) return { ok: false, status: 404 };
	return { ok: true, state };
}
