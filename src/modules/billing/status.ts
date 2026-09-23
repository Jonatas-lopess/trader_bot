/**
 * The intermediate confirmation page's poll target (spec.md's "Status
 * endpoint", ~2s interval, no WebSocket/Durable Object — PLANNING.md §7).
 */

type StatusEnv = Pick<Cloudflare.Env, 'DB'>;

export type SubscriptionState = 'pending' | 'active' | 'past_due' | 'canceled' | 'awaiting_boleto';

export type SubscriptionStatusResult =
	| { ok: true; state: SubscriptionState }
	| { ok: false; status: 404 };

export async function getSubscriptionStatus(
	env: StatusEnv,
	reference: string | null
): Promise<SubscriptionStatusResult> {
	if (reference === null || reference === '') return { ok: false, status: 404 };

	const row = await env.DB.prepare('SELECT status, payment_method FROM subscriptions WHERE id = ?')
		.bind(reference)
		.first<{ status: SubscriptionState; payment_method: string | null }>();
	if (row === null) return { ok: false, status: 404 };

	// Boleto's "confirmação em até 1 dia útil" (User Story 4) is a distinct
	// state from generic pending, not a status column value of its own —
	// the underlying row stays `pending` until the webhook confirms it.
	if (row.status === 'pending' && row.payment_method === 'boleto') {
		return { ok: true, state: 'awaiting_boleto' };
	}
	return { ok: true, state: row.status };
}
