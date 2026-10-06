/**
 * The 7-day withdrawal (arrependimento) window — .scratch/withdrawal-guarantee/issues/02-withdrawal-request-path.md,
 * CDC art. 49. Counted from `purchases.created_at` (owner decision, ticket 04; the lawyer confirms
 * "assinatura ou recebimento"), in calendar days: the purchase day is excluded and day 7 runs to its
 * end (Código Civil art. 132, the lawyer confirms). A Mensal keeps one purchases row across
 * renewals, so only its first charge is ever inside the window.
 */

import type { PurchaseStatus } from '../billing/payment-provider';
import { withdrawalMailBody, withdrawalMailSubject } from '../../content/conta';
import { supportMailto } from '../../content/support';

const DAY_MS = 24 * 60 * 60 * 1000;
// Brasília time is UTC-3 all year (no daylight saving since 2019); days are counted on that clock.
const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Open through the last millisecond of day 7 in Brasília time, closed from midnight starting day 8.
 * Both instants are shifted onto the Brasília clock so the UTC fields read as Brasília wall time.
 */
export function withdrawalWindowOpen(createdAt: string, now: Date): boolean {
	const purchasedAt = new Date(createdAt).getTime() + BRASILIA_OFFSET_MS;
	const purchaseDayStart = Math.floor(purchasedAt / DAY_MS) * DAY_MS;
	const windowEnd = purchaseDayStart + 8 * DAY_MS;
	return now.getTime() + BRASILIA_OFFSET_MS < windowEnd;
}

// A paid purchase the Cliente can still withdraw from (a canceled Mensal included); pending and
// rejected have no charge to refund, refunded and chargeback are already reversed.
const WITHDRAWABLE_STATUSES: ReadonlySet<PurchaseStatus> = new Set(['active', 'past_due', 'canceled']);

/** Whether `/conta` offers the withdrawal request for this purchase: a paid status, inside the window. */
export function withdrawalAvailable(purchase: { status: PurchaseStatus; createdAt: string }, now: Date): boolean {
	return WITHDRAWABLE_STATUSES.has(purchase.status) && withdrawalWindowOpen(purchase.createdAt, now);
}

/** The prefilled support e-mail a Cliente sends to request the withdrawal. */
export function withdrawalRequestMailto(params: { purchaseId: string; email: string }): string {
	// One pass with a function replacer: values are inserted verbatim (a `$&` in an e-mail stays literal)
	// and never re-expanded.
	const values: Record<string, string> = { purchaseId: params.purchaseId, email: params.email };
	const fill = (template: string) => template.replace(/\{(purchaseId|email)\}/g, (_, key: string) => values[key]);
	// RFC 6068: line breaks in a mailto body are CRLF.
	const encode = (text: string) => encodeURIComponent(text.replaceAll('\n', '\r\n'));
	const subject = encode(fill(withdrawalMailSubject.value));
	const body = encode(fill(withdrawalMailBody.value));
	return `${supportMailto()}?subject=${subject}&body=${body}`;
}
