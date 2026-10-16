/**
 * `/billing/webhook` core (spec.md's "Webhook trust model" and "D1
 * concurrency — compare-and-swap, not read-then-write"). Every delivery:
 *
 *   1. Raw payload logged unconditionally (independent of everything below).
 *      An event outside `APPMAX_ORDER_EVENTS` (and not `subscription_*`) stops
 *      here with a 200: stored, acknowledged, never acted on.
 *   2. Idempotency claimed via one INSERT; a duplicate stops here.
 *   3. Appmax's own API re-fetches the referenced record's authoritative
 *      status — the payload's own status field is never trusted, only used
 *      to know which record to check.
 *   4. A single compare-and-swap UPDATE applies it, ranked by rigidity so a
 *      less-current event can never undo a more-current one.
 *
 * An order can hold several purchase rows (a cart, storefront-v2 12, ADR-0008): they share
 * `appmax_order_id`, so the amount check compares against their sum, the one CAS moves all of
 * them (`meta.changes` is the row count, read only as "> 0"), each row gets its own Licença sync
 * in the same batch, and the Cliente is provisioned once. Refund, chargeback and cancel move the
 * whole order; a per-Licença partial refund is manual (docs/ops/withdrawal-refund.md).
 *
 * `src/pages/billing/webhook.ts` is the thin Astro adapter around this.
 */

import * as Sentry from '@sentry/cloudflare';
import { classifyWebhookEvent, fetchAuthoritativeStatus, parseWebhookPayload, type AppmaxWebhookEvent } from './appmax-client';
import { issueMagicLink } from '../identity/magic-link';
import { orderLicenseSyncStatements, provisionOrderCustomer } from './order-rows';
import {
	STATUS_RIGIDITY,
	STATUS_RIGIDITY_CASE_SQL,
	checkReportedAmount,
	findPurchaseIdByProviderRef,
	reportAmountCheck,
	reportMissingBuyerDocument,
	PAID_AT_SQL,
} from './purchase-lookup';

type WebhookEnv = Pick<Cloudflare.Env, 'DB' | 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET' | 'RESEND_API_KEY'>;

// Same not-yet-registered placeholder domain as `resend-client.ts`'s
// `FROM_ADDRESS` and `scripts/send-download-link.ts`'s `DEFAULT_ORIGIN`
// (PLANNING.md §12 — a go-live gate, not a build blocker). The webhook has
// no request of its own to derive an origin from (a server-to-server Appmax
// callback), unlike `requestMagicLink`'s caller (`pages/login/request.ts`),
// which passes the real `url.origin`.
const APP_ORIGIN = 'https://robotrader.com.br';

// pending < active < past_due < canceled (STATUS_RIGIDITY, purchase-lookup.ts).
// This ticket's scope (checkout-webhooks) only exercises pending→active and
// the canceled-must-not-be-undone case from spec.md's user story 8; it does
// not cover recovering a `past_due` subscription back to `active` — that's
// multi-day dunning, PLANNING.md §6, "ours to build" as separate future
// work. Revisit this ranking when that's built if recovery needs to apply.

function buildIdempotencyKey(event: AppmaxWebhookEvent): string {
	// spec.md: "subscription_id + order_id + event" for subscription-lifecycle
	// events (distinguished here by the payload carrying a subscription_id at
	// all), "order_id + event" otherwise (Appmax's own recommendation).
	return event.subscriptionId !== null
		? `${event.event}:${event.subscriptionId}:${event.orderId}`
		: `${event.event}:${event.orderId}`;
}

/** Gives an event back to Appmax's retry schedule (4 attempts, 5s timeout, no signature): only a claimed key that ends in a lost event needs releasing. */
async function releaseIdempotency(env: WebhookEnv, idempotencyKey: string): Promise<void> {
	await env.DB.prepare('DELETE FROM processed_webhooks WHERE id = ?').bind(idempotencyKey).run();
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
 * changed) — `provisionCustomer`'s attach-only-if-unattached write is what
 * makes that safe to call again (own idempotency, per this function's
 * original doc comment).
 *
 * Resolves every purchase row of the order (our own PKs, needed by
 * `provisionCustomer`; a cart is one row per Licença, ADR-0008, so the
 * Cliente is provisioned once and every row attached to it) with one
 * `SELECT` by `appmax_order_id`/`appmax_subscription_id` — the same columns
 * the CAS `UPDATE` above just matched on. This is a read of
 * the row this same request just wrote, not a TOCTOU race: the state
 * transition itself was already decided atomically by the CAS `UPDATE`;
 * this lookup only resolves an id for a write that's already committed to
 * happening.
 *
 * Also the point a first-activation auto-sends the magic-link login email
 * (customer-area ticket 06/07). The e-mail is the one the Cliente typed on our
 * own checkout form (ADR-0007), read back from Appmax's order refetch, never
 * from the webhook payload. Gated on
 * `provisionCustomer`'s `created` flag, not merely "status is active": a
 * reapplied/renewal event for an already-attached purchase must not
 * re-issue a login email on every renewal, only on the purchase's first
 * activation (a repeat buyer's second purchase gets its own link). `/login`'s own type-your-email flow (`requestMagicLink`)
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
		Sentry.captureMessage("onSubscriptionBecameActive: no email field on Appmax's authoritative response", {
			extra: { order_id: ref.orderId, subscription_id: ref.subscriptionId },
		});
		return;
	}

	// `provider = 'appmax'` guards against ever matching a row created by
	// the test-only Stripe driver (docs/adr/0005-stripe-test-driver.md) —
	// same defense-in-depth stripe-webhook.ts's own CAS applies in reverse,
	// even though the two gateways' id formats don't collide in practice.
	// Every row of the order (a cart is one row per Licença, ADR-0008): one Cliente, one login link.
	const provisioned = await provisionOrderCustomer(env, 'appmax', ref, email);
	if (provisioned.kind === 'no_rows') return;
	if (provisioned.kind === 'malformed_email') {
		const purchaseId = provisioned.purchaseId;
		console.error(`onSubscriptionBecameActive: malformed buyer email for purchase_id=${purchaseId} — customers row not created`);
		Sentry.captureMessage('onSubscriptionBecameActive: malformed buyer email', { extra: { purchase_id: purchaseId } });
		return;
	}
	if (!provisioned.customer.created) return;

	await issueMagicLink(env, { customerId: provisioned.customer.id, email, origin: APP_ORIGIN });
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

	if (classifyWebhookEvent(event.event) === 'unknown') {
		// Stored above for support and replay; acknowledged so Appmax does not retry it.
		console.info(`handleWebhook: ignored Appmax event ${event.event.slice(0, 64)}`);
		return { status: 200 };
	}

	const isFirstDelivery = await claimIdempotency(env, idempotencyKey);
	if (!isFirstDelivery) return { status: 200 };

	const authoritative = await fetchAuthoritativeStatus(env, {
		orderId: event.orderId,
		subscriptionId: event.subscriptionId,
	});
	if (!authoritative.ok) {
		// A 200 here would make Appmax's retry a "duplicate" and lose the event.
		await releaseIdempotency(env, idempotencyKey);
		return { status: 502 };
	}

	if (authoritative.operatorReview !== undefined) {
		Sentry.captureMessage(`handleWebhook: ${authoritative.operatorReview}`, {
			extra: { order_id: event.orderId, subscription_id: event.subscriptionId },
		});
	}

	const checked = await checkReportedAmount(
		env,
		'appmax',
		{ orderId: event.orderId, subscriptionId: event.subscriptionId },
		authoritative
	);

	// No `status != ?` guard: an authoritative re-fetch that reports the
	// *same* status as the row already has (e.g. Appmax confirms a Boleto
	// is still `pending`, now with a known payment_method it didn't have
	// before) must still be allowed to apply — the rigidity check alone
	// (`<=`, not `<`) already makes this safe, and payment_method needs to
	// land independent of whether status itself changed.
	const casStatement = env.DB.prepare(
		`UPDATE purchases
		 SET status = ?, payment_method = COALESCE(?, payment_method),
			     buyer_name = COALESCE(buyer_name, ?),
			     buyer_document = COALESCE(buyer_document, ?),
			     paid_at = ${PAID_AT_SQL},
			     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE provider = 'appmax'
		   AND (appmax_order_id = ? OR appmax_subscription_id = ?)
		   AND ${STATUS_RIGIDITY_CASE_SQL} <= ?`
	).bind(
		checked.status,
		authoritative.paymentMethod,
		authoritative.buyer.name,
		authoritative.buyer.document,
		checked.status,
		event.orderId,
		event.subscriptionId,
		STATUS_RIGIDITY[checked.status]
	);

	// Licença expiry is derived from the new status in the same batch (one transaction), so
	// no path edits `licenses.expires_at` on its own (license-expiry.ts).
	// One Licença per row of the order (ADR-0008); each statement is guarded by its own row's status.
	const syncStatements = await orderLicenseSyncStatements(
		env,
		'appmax',
		{ orderId: event.orderId, subscriptionId: event.subscriptionId },
		checked.status,
		new Date()
	);
	const [result] = await env.DB.batch([casStatement, ...syncStatements]);

	if (result.meta.changes > 0) reportAmountCheck('appmax', checked);

	if (checked.status === 'active' && result.meta.changes > 0) {
		// A subscription response carries no customer, so only an order refetch can know the document.
		if (event.subscriptionId === null) {
			await reportMissingBuyerDocument(env, 'appmax', { orderId: event.orderId, subscriptionId: null });
		}
		await onSubscriptionBecameActive(
			env,
			{ orderId: event.orderId, subscriptionId: event.subscriptionId },
			authoritative.email
		);
	}

	// `result.meta.changes === 0` is ambiguous by itself: a genuinely
	// unmatched ref and a rigidity-blocked stale event (out-of-order
	// delivery, expected/benign) both land here. Only the former is worth
	// reporting — resolved by a second lookup, same ref-matching query
	// `onSubscriptionBecameActive` already uses.
	if (result.meta.changes === 0) {
		const existing = await findPurchaseIdByProviderRef(env, 'appmax', {
			orderId: event.orderId,
			subscriptionId: event.subscriptionId,
		});
		if (existing === null) {
			console.error(
				`handleWebhook: no subscription row matches order_id=${event.orderId ?? 'null'} subscription_id=${event.subscriptionId ?? 'null'}`
			);
			Sentry.captureMessage('handleWebhook: no subscription row matches order/subscription id', {
				extra: { order_id: event.orderId, subscription_id: event.subscriptionId },
			});
		}
	}

	return { status: 200 };
}
