/**
 * What the confirmation page shows for a checkout, and the poll target behind it (spec.md's
 * "Status endpoint", ~2s interval, no WebSocket/Durable Object — PLANNING.md §7).
 * `getPurchaseView` is the one read: `/checkout/confirmacao` renders its first paint from it
 * and `/billing/status` answers the same `state` (appmax-checkout 06).
 *
 * Pix and Boleto instructions come from `purchases.payment_instructions` (written by `pay.ts`),
 * so a reload shows the same Pix again. They are gateway data, so they are validated here
 * before any page renders them: only an `https:` PDF link and a `data:image/png;base64,` or
 * `https:` QR source survive; a missing or unparseable value degrades to the generic pending
 * message, never to an error page. For a card the same column holds only `{"declined": true}`,
 * written by `pay.ts` when Appmax refused the payment: the row stays `pending` (nothing was paid),
 * and this marker is what tells a refused card from one in antifraud review.
 */

import { isRecord } from '../../shared/is-record';
import type { PurchaseOffer } from '../catalog/robots';
import type { PurchaseStatus } from './payment-provider';
import { findByCheckout, STATUS_RIGIDITY } from './purchase-lookup';

type StatusEnv = Pick<Cloudflare.Env, 'DB'>;

/**
 * A purchase status, or one of the unpaid states the page can act on. None of them is a
 * status column value: the rows stay `pending` until the webhook confirms them.
 */
export type PurchaseState =
	| PurchaseStatus
	| 'awaiting_boleto'
	| 'boleto_overdue'
	| 'awaiting_pix'
	| 'pix_expired'
	| 'card_in_review'
	| 'card_declined';

export type PixView = {
	kind: 'pix';
	/** `data:image/png;base64,...` or an `https:` URL; `null` when Appmax's value was neither. */
	qrSrc: string | null;
	/** The copy-paste ("copia e cola") code; `null` when absent (the QR alone still pays). */
	emvCode: string | null;
	/** ISO instant; `null` when unreadable (the Pix is shown without a deadline). */
	expiresAt: string | null;
};

export type BoletoView = {
	kind: 'boleto';
	/** `https:` only. */
	pdfUrl: string | null;
	digitableLine: string | null;
	/** `YYYY-MM-DD`, a Brasília calendar day. */
	dueDate: string | null;
};

export type PurchaseView = {
	state: PurchaseState;
	method: string | null;
	instructions: PixView | BoletoView | null;
	/**
	 * What the checkout bought: one entry per Robô and Oferta with its number of Licenças, in the
	 * order of the rows (storefront-v2 13). Also what a new checkout of the same thing is built from.
	 */
	items: PurchaseItem[];
};

export type PurchaseItem = { robotId: string; offer: PurchaseOffer; quantity: number };

export type PurchaseViewResult = { ok: true; view: PurchaseView } | { ok: false; status: 404 };
export type PurchaseStatusResult = { ok: true; state: PurchaseState } | { ok: false; status: 404 };

type CheckoutStatusRow = { status: PurchaseStatus; paymentMethod: string | null };
type CheckoutViewRow = CheckoutStatusRow & {
	paymentInstructions: string | null;
	robotId: string;
	offer: PurchaseOffer;
};

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

/** Printable text without markup characters, bounded: what a payment code or digitable line is. */
function safeText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text !== '' && text.length <= maxLength && !/[<>"'`\u0000-\u001f]/.test(text) ? text : null;
}

function httpsUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}

const PNG_DATA_URI = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

function qrSource(value: unknown): string | null {
	if (typeof value === 'string' && value.length <= 200_000 && PNG_DATA_URI.test(value)) return value;
	return httpsUrl(value);
}

/** Brasília is fixed UTC-3 (no DST since 2019), the clock Appmax's local timestamps are assumed to use (unverified, 08). */
const BRASILIA_OFFSET = '-03:00';

/** An ISO instant with a zone, or Appmax's zone-less `YYYY-MM-DD HH:MM:SS` read as Brasília time. */
function parseInstant(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(text);
	const iso = local ? `${local[1]}T${local[2]}${BRASILIA_OFFSET}` : text;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return null;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDay(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const day = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())?.[1];
	return day !== undefined && !Number.isNaN(new Date(`${day}T00:00:00${BRASILIA_OFFSET}`).getTime()) ? day : null;
}

function parseJson(text: string | null): Record<string, unknown> | null {
	if (text === null) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function parsePixInstructions(text: string | null): PixView | null {
	const raw = parseJson(text);
	if (raw === null) return null;
	const qrSrc = qrSource(raw.qrCode);
	const emvCode = safeText(raw.emvCode, 1024);
	if (qrSrc === null && emvCode === null) return null;
	return { kind: 'pix', qrSrc, emvCode, expiresAt: parseInstant(raw.expiresAt) };
}

/** `pay.ts`'s marker for a card Appmax refused (the row stays `pending`, nothing was charged). */
export const CARD_DECLINED_MARKER = JSON.stringify({ declined: true });

function isDeclinedCard(text: string | null): boolean {
	return parseJson(text)?.declined === true;
}

export function parseBoletoInstructions(text: string | null): BoletoView | null {
	const raw = parseJson(text);
	if (raw === null) return null;
	const pdfUrl = httpsUrl(raw.pdfUrl);
	const digitableLine = safeText(raw.digitableLine, 128);
	if (pdfUrl === null && digitableLine === null) return null;
	return { kind: 'boleto', pdfUrl, digitableLine, dueDate: parseDay(raw.dueDate) };
}

/** Past the end of the due day in Brasília. */
function isOverdue(dueDate: string, now: Date): boolean {
	return now.getTime() > new Date(`${dueDate}T23:59:59.999${BRASILIA_OFFSET}`).getTime();
}

/** The rows (one per Licença) folded back into lines, keeping the order each Robô and Oferta first appears in. */
function itemsOf(rows: readonly CheckoutViewRow[]): PurchaseItem[] {
	const items: PurchaseItem[] = [];
	for (const { robotId, offer } of rows) {
		const existing = items.find((item) => item.robotId === robotId && item.offer === offer);
		if (existing) existing.quantity += 1;
		else items.push({ robotId, offer, quantity: 1 });
	}
	return items;
}

/**
 * Pure: the page's view of a checkout's rows at `now`. `null` for no rows. A cart's rows share
 * one payment, and the pay endpoint stores the Pix or Boleto on every row, so the first pending
 * row's instructions are the order's.
 */
export function derivePurchaseView(rows: readonly CheckoutViewRow[], now: Date): PurchaseView | null {
	const aggregate = aggregateCheckoutStatus(rows);
	if (aggregate === null) return null;
	const items = itemsOf(rows);
	const pending = rows.find((row) => row.status === 'pending');
	if (pending === undefined || (aggregate !== 'pending' && aggregate !== 'awaiting_boleto')) {
		return { state: aggregate, method: rows[0].paymentMethod, instructions: null, items };
	}

	const method = pending.paymentMethod;
	if (method === 'pix') {
		const pix = parsePixInstructions(pending.paymentInstructions);
		if (pix === null) return { state: 'pending', method, instructions: null, items };
		const expired = pix.expiresAt !== null && now.getTime() >= new Date(pix.expiresAt).getTime();
		return { state: expired ? 'pix_expired' : 'awaiting_pix', method, instructions: pix, items };
	}
	if (method === 'boleto') {
		const boleto = parseBoletoInstructions(pending.paymentInstructions);
		const overdue = boleto?.dueDate != null && isOverdue(boleto.dueDate, now);
		return { state: overdue ? 'boleto_overdue' : 'awaiting_boleto', method, instructions: boleto, items };
	}
	if (method === 'card') {
		return { state: isDeclinedCard(pending.paymentInstructions) ? 'card_declined' : 'card_in_review', method, instructions: null, items };
	}
	return { state: aggregate, method, instructions: null, items };
}

/** `reference` is the `checkout_id` (equal to the first row's `id`), so a single purchase answers for itself. */
export async function getPurchaseView(
	env: StatusEnv,
	reference: string | null,
	now: Date = new Date()
): Promise<PurchaseViewResult> {
	if (reference === null || reference === '') return { ok: false, status: 404 };
	const view = derivePurchaseView(await findByCheckout(env, reference), now);
	return view === null ? { ok: false, status: 404 } : { ok: true, view };
}

/** The state alone, as `/billing/status` answers it. */
export async function getPurchaseStatus(env: StatusEnv, reference: string | null): Promise<PurchaseStatusResult> {
	const result = await getPurchaseView(env, reference);
	return result.ok ? { ok: true, state: result.view.state } : result;
}
