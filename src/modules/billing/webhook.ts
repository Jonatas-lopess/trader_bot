/**
 * `/billing/webhook` core (spec.md's "Webhook trust model" and "D1
 * concurrency — compare-and-swap, not read-then-write"). Every delivery:
 *
 *   1. Raw payload logged unconditionally (independent of everything below).
 *   2. Idempotency claimed via one INSERT; a duplicate stops here.
 *   3. Appmax's own API re-fetches the referenced record's authoritative
 *      status — the payload's own status field is never trusted, only used
 *      to know which record to check.
 *   4. A single compare-and-swap UPDATE applies it, ranked by rigidity so a
 *      less-current event can never undo a more-current one.
 *
 * `src/pages/billing/webhook.ts` is the thin Astro adapter around this.
 */

import {
	fetchAuthoritativeStatus,
	parseWebhookPayload,
	type AppmaxSubscriptionState,
	type AppmaxWebhookEvent,
} from './appmax-client';
import { provisionCustomer } from '../identity/customers';
import { issueMagicLink } from '../identity/magic-link';

type WebhookEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'RESEND_API_KEY'>;

// Same not-yet-registered placeholder domain as `resend-client.ts`'s
// `FROM_ADDRESS` and `scripts/send-download-link.ts`'s `DEFAULT_ORIGIN`
// (PLANNING.md §12 — a go-live gate, not a build blocker). The webhook has
// no request of its own to derive an origin from (a server-to-server Appmax
// callback), unlike `requestMagicLink`'s caller (`pages/login/request.ts`),
// which passes the real `url.origin`.
const APP_ORIGIN = 'https://robotrader.com.br';

// pending < active < past_due < canceled. This ticket's scope
// (checkout-webhooks) only exercises pending→active and the
// canceled-must-not-be-undone case from spec.md's user story 8; it does not
// cover recovering a `past_due` subscription back to `active` — that's
// multi-day dunning, PLANNING.md §6, "ours to build" as separate future
// work. Revisit this ranking when that's built if recovery needs to apply.
const STATUS_RIGIDITY: Record<AppmaxSubscriptionState, number> = {
	pending: 0,
	active: 1,
	past_due: 2,
	canceled: 3,
};

function buildIdempotencyKey(event: AppmaxWebhookEvent): string {
	// spec.md: "subscription_id + order_id + event" for subscription-lifecycle
	// events (distinguished here by the payload carrying a subscription_id at
	// all), "order_id + event" otherwise (Appmax's own recommendation).
	return event.subscriptionId !== null
		? `${event.event}:${event.subscriptionId}:${event.orderId}`
		: `${event.event}:${event.orderId}`;
}

async function logDelivery(env: WebhookEnv, idempotencyKey: string, rawBody: string): Promise<void> {
	await env.DB.prepare('INSERT INTO webhook_deliveries (idempotency_key, payload) VALUES (?, ?)')
		.bind(idempotencyKey, rawBody)
		.run();
}

/** Returns `true` if this is the first delivery seen for `idempotencyKey`. */
async function claimIdempotency(env: WebhookEnv, idempotencyKey: string): Promise<boolean> {
	try {
		await env.DB.prepare('INSERT INTO processed_webhooks (id) VALUES (?)').bind(idempotencyKey).run();
		return true;
	} catch {
		// UNIQUE/PRIMARY KEY violation *is* the "already processed" signal —
		// no prior SELECT (spec.md user story 6).
		return false;
	}
}

/**
 * The single, identifiable spot an Assinatura first lands on `active`
 * (spec.md's "Module boundary", user story 13) — customer-area/issues/01's
 * `customers` provisioning attaches here. It fires whenever this webhook's
 * compare-and-swap actually applies with `active` as the new status —
 * including a replay that finds the row already `active` (two distinct
 * events, e.g. a renewal, can each independently re-apply `active`; the
 * CAS's `meta.changes` only proves *this* write landed, not that the value
 * changed) — `provisionCustomer`'s own `ON CONFLICT DO NOTHING` is what
 * makes that safe to call again (own idempotency, per this function's
 * original doc comment).
 *
 * Resolves `subscriptions.id` (our own PK, needed by `provisionCustomer`)
 * with one `SELECT` by `appmax_order_id`/`appmax_subscription_id` — the
 * same columns the CAS `UPDATE` above just matched on. This is a read of
 * the row this same request just wrote, not a TOCTOU race: the state
 * transition itself was already decided atomically by the CAS `UPDATE`;
 * this lookup only resolves an id for a write that's already committed to
 * happening.
 *
 * Also the point a first-activation auto-sends the magic-link login email
 * (customer-area ticket 06/07) — the Cliente never types an email anywhere
 * on our own checkout (`checkout.ts` only ever collects `planId`; Appmax's
 * hosted page is what collects the email this function receives). Gated on
 * `provisionCustomer`'s `created` flag, not merely "status is active": a
 * reapplied/renewal event that resolves to the `ON CONFLICT` no-op must not
 * re-issue a login email on every renewal, only on the subscription's first
 * activation. `/login`'s own type-your-email flow (`requestMagicLink`)
 * still exists unchanged as the self-service fallback.
 */
async function onSubscriptionBecameActive(
	env: WebhookEnv,
	ref: { orderId: string | null; subscriptionId: string | null },
	email: string | null
): Promise<void> {
	if (email === null) {
		console.error(
			`onSubscriptionBecameActive: no email field on Appmax's authoritative response for order_id=${ref.orderId ?? 'null'} subscription_id=${ref.subscriptionId ?? 'null'} — customers row not created`
		);
		return;
	}

	// `provider = 'appmax'` guards against ever matching a row created by
	// the test-only Stripe driver (docs/adr/0005-stripe-test-driver.md) —
	// same defense-in-depth stripe-webhook.ts's own CAS applies in reverse,
	// even though the two gateways' id formats don't collide in practice.
	const row = await env.DB.prepare(
		"SELECT id FROM subscriptions WHERE provider = 'appmax' AND (appmax_order_id = ? OR appmax_subscription_id = ?) LIMIT 1"
	)
		.bind(ref.orderId, ref.subscriptionId)
		.first<{ id: string }>();
	if (row === null) return;

	const customer = await provisionCustomer(env, { subscriptionId: row.id, email });
	if (!customer.created) return;

	await issueMagicLink(env, { customerId: customer.id, email, origin: APP_ORIGIN });
}

export async function handleWebhook(env: WebhookEnv, rawBody: string): Promise<{ status: number }> {
	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		json = null;
	}

	const event = parseWebhookPayload(json);
	// Even an unparseable delivery gets logged under its own key so a
	// support case can see exactly what arrived.
	const idempotencyKey = event !== null ? buildIdempotencyKey(event) : `unparseable:${crypto.randomUUID()}`;
	await logDelivery(env, idempotencyKey, rawBody);

	if (event === null) return { status: 200 };

	const isFirstDelivery = await claimIdempotency(env, idempotencyKey);
	if (!isFirstDelivery) return { status: 200 };

	const authoritative = await fetchAuthoritativeStatus(env, {
		orderId: event.orderId,
		subscriptionId: event.subscriptionId,
	});
	if (!authoritative.ok) return { status: 200 };

	// No `status != ?` guard: an authoritative re-fetch that reports the
	// *same* status as the row already has (e.g. Appmax confirms a Boleto
	// is still `pending`, now with a known payment_method it didn't have
	// before) must still be allowed to apply — the rigidity check alone
	// (`<=`, not `<`) already makes this safe, and payment_method needs to
	// land independent of whether status itself changed.
	const result = await env.DB.prepare(
		`UPDATE subscriptions
		 SET status = ?, payment_method = COALESCE(?, payment_method), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE provider = 'appmax'
		   AND (appmax_order_id = ? OR appmax_subscription_id = ?)
		   AND CASE status
		         WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'past_due' THEN 2 WHEN 'canceled' THEN 3
		       END <= ?`
	)
		.bind(
			authoritative.status,
			authoritative.paymentMethod,
			event.orderId,
			event.subscriptionId,
			STATUS_RIGIDITY[authoritative.status]
		)
		.run();

	if (authoritative.status === 'active' && result.meta.changes > 0) {
		await onSubscriptionBecameActive(
			env,
			{ orderId: event.orderId, subscriptionId: event.subscriptionId },
			authoritative.email
		);
	}

	return { status: 200 };
}
