/**
 * The intermediate confirmation page's poll target (spec.md's "Status
 * endpoint", ~2s interval, no WebSocket/Durable Object — PLANNING.md §7).
 */

import type { PurchaseStatus } from './payment-provider';

type StatusEnv = Pick<Cloudflare.Env, 'DB'>;

export type PurchaseState = PurchaseStatus | 'awaiting_boleto';

export type PurchaseStatusResult =
	| { ok: true; state: PurchaseState }
	| { ok: false; status: 404 };

export async function getPurchaseStatus(
	env: StatusEnv,
	reference: string | null
): Promise<PurchaseStatusResult> {
	if (reference === null || reference === '') return { ok: false, status: 404 };

	const row = await env.DB.prepare('SELECT status, payment_method FROM purchases WHERE id = ?')
		.bind(reference)
		.first<{ status: PurchaseState; payment_method: string | null }>();
	if (row === null) return { ok: false, status: 404 };

	// Boleto's "confirmação em até 1 dia útil" (User Story 4) is a distinct
	// state from generic pending, not a status column value of its own —
	// the underlying row stays `pending` until the webhook confirms it.
	if (row.status === 'pending' && row.payment_method === 'boleto') {
		return { ok: true, state: 'awaiting_boleto' };
	}
	return { ok: true, state: row.status };
}
