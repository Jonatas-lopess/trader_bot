/**
 * `/billing/webhook/stripe` core — the Stripe counterpart to webhook.ts,
 * kept as its own module rather than folded into the Appmax handler
 * (payment-provider.ts's header explains why: trust models and payload
 * shapes aren't unifiable without faking a shared contract). Test-only
 * stopgap while Appmax onboarding is blocked (docs/adr/0005); Appmax stays
 * the committed production webhook (ADR-0003).
 *
 * Unlike Appmax, Stripe DOES sign webhook deliveries
 * (https://docs.stripe.com/webhooks#verify-manually) — `Stripe-Signature:
 * t=<timestamp>,v1=<hex hmac>` over `${timestamp}.${rawBody}`, keyed by
 * `STRIPE_WEBHOOK_SECRET`. Verified here instead of trusted on the payload's
 * own say-so, same posture as webhook-hardening.ts's source-IP check for
 * Appmax, just provider-native instead of a workaround for a gateway that
 * doesn't sign anything.
 *
 * Same D1 concurrency rule as webhook.ts: idempotency as one INSERT, status
 * transition as one rigidity-ranked compare-and-swap UPDATE, no
 * SELECT-then-write race window (PLANNING.md §6).
 */

import { provisionCustomer } from '../identity/customers';
import { issueMagicLink } from '../identity/magic-link';
import { timingSafeEqual } from '../identity/session';
import { fetchAuthoritativeStatus } from './stripe-client';
import {
	STATUS_RIGIDITY,
	STATUS_RIGIDITY_CASE_SQL,
	findSubscriptionIdByProviderRef,
} from './subscription-lookup';

type StripeWebhookEnv = Pick<
	Cloudflare.Env,
	'DB' | 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET' | 'RESEND_API_KEY'
>;

// Same placeholder as webhook.ts's APP_ORIGIN (PLANNING.md §12) — a
// server-to-server callback has no request of its own to derive an origin
// from.
const APP_ORIGIN = 'https://robotrader.com.br';

function hex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Verifies `Stripe-Signature` per Stripe's documented scheme. Returns the
 * timestamp-and-body-bound signature check result only — the 5-minute
 * tolerance window Stripe's own libraries apply is skipped here (a
 * test-only driver has no replay-attack surface worth the extra clock-skew
 * handling); a valid signature on stale-but-well-formed data still passes.
 */
async function verifySignature(
	env: Pick<StripeWebhookEnv, 'STRIPE_WEBHOOK_SECRET'>,
	rawBody: string,
	signatureHeader: string | null
): Promise<boolean> {
	// `!env.STRIPE_WEBHOOK_SECRET` (not just `=== ''`) — an unset binding is
	// `undefined`, not `''`, and must fail closed the same way an empty one
	// does. Production never provisions this secret (Stripe is a test-only
	// stopgap, ADR-0003/docs/adr/0005), so `undefined` is the expected
	// production value, not an edge case.
	if (signatureHeader === null || !env.STRIPE_WEBHOOK_SECRET) return false;

	const parts = new Map(
		signatureHeader
			.split(',')
			.map((part) => part.split('=') as [string, string])
			.filter((pair) => pair.length === 2)
	);
	const timestamp = parts.get('t');
	const providedSignature = parts.get('v1');
	if (timestamp === undefined || providedSignature === undefined) return false;

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));

	return timingSafeEqual(hex(signature), providedSignature);
}

type StripeEvent = {
	id: string;
	type: string;
	data: { object: { id: string; object: string; subscription: string | null } };
};

function parseEvent(rawBody: string): StripeEvent | null {
	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		return null;
	}
	if (typeof json !== 'object' || json === null) return null;
	const body = json as Record<string, unknown>;
	if (typeof body.id !== 'string' || typeof body.type !== 'string') return null;
	const data = body.data as { object?: { id?: unknown; object?: unknown; subscription?: unknown } } | undefined;
	const object = data?.object;
	if (typeof object?.id !== 'string' || typeof object?.object !== 'string') return null;
	return {
		id: body.id,
		type: body.type,
		data: {
			object: {
				id: object.id,
				object: object.object,
				subscription: typeof object.subscription === 'string' ? object.subscription : null,
			},
		},
	};
}

/** Mirrors webhook.ts's own onSubscriptionBecameActive — same provisioning/magic-link gate, Stripe-sourced. */
async function onSubscriptionBecameActive(
	env: StripeWebhookEnv,
	ref: { orderId: string | null; subscriptionId: string | null },
	email: string | null
): Promise<void> {
	if (email === null) {
		console.error(
			`stripe-webhook onSubscriptionBecameActive: no email on Stripe's authoritative response for session=${ref.orderId ?? 'null'} subscription=${ref.subscriptionId ?? 'null'} — customers row not created`
		);
		return;
	}

	const subscriptionId = await findSubscriptionIdByProviderRef(env, 'stripe', ref);
	if (subscriptionId === null) return;

	const customer = await provisionCustomer(env, { subscriptionId, email });
	if (!customer.created) return;

	await issueMagicLink(env, { customerId: customer.id, email, origin: APP_ORIGIN });
}

export async function handleStripeWebhook(
	env: StripeWebhookEnv,
	rawBody: string,
	signatureHeader: string | null
): Promise<{ status: number }> {
	if (!(await verifySignature(env, rawBody, signatureHeader))) return { status: 400 };

	const event = parseEvent(rawBody);
	const idempotencyKey = event !== null ? `stripe:${event.id}` : `stripe:unparseable:${crypto.randomUUID()}`;
	await env.DB.prepare('INSERT INTO webhook_deliveries (idempotency_key, payload) VALUES (?, ?)')
		.bind(idempotencyKey, rawBody)
		.run();

	if (event === null) return { status: 200 };

	try {
		await env.DB.prepare('INSERT INTO processed_webhooks (id) VALUES (?)').bind(idempotencyKey).run();
	} catch {
		return { status: 200 };
	}

	// checkout.session.completed carries the checkout session id as
	// `data.object.id` (`cs_...`) and, once the first invoice is paid, the
	// subscription id in `data.object.subscription`. Anything else
	// (customer.subscription.updated/deleted) carries a subscription id
	// directly as `data.object.id` (`sub_...`).
	const isSessionEvent = event.data.object.object === 'checkout.session';
	const ref = isSessionEvent
		? { orderId: event.data.object.id, subscriptionId: event.data.object.subscription }
		: { orderId: null, subscriptionId: event.data.object.id };

	const authoritative = await fetchAuthoritativeStatus(env, ref);
	if (!authoritative.ok) return { status: 200 };

	// `appmax_subscription_id = COALESCE(appmax_subscription_id, ?)`: the
	// checkout.session.completed row is inserted (checkout.ts) with only
	// appmax_order_id (the `cs_...` session id) — the `sub_...` subscription
	// id only becomes known here, on the first event that carries it, and
	// must be persisted or every later event keyed by subscription id alone
	// (customer.subscription.updated/.deleted) can never match this row
	// again, and cancel.ts's gateway cancel call can never be dispatched.
	const result = await env.DB.prepare(
		`UPDATE subscriptions
		 SET status = ?,
		     payment_method = COALESCE(?, payment_method),
		     appmax_subscription_id = COALESCE(appmax_subscription_id, ?),
		     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE provider = 'stripe'
		   AND (appmax_order_id = ? OR appmax_subscription_id = ?)
		   AND ${STATUS_RIGIDITY_CASE_SQL} <= ?`
	)
		.bind(
			authoritative.status,
			authoritative.paymentMethod,
			ref.subscriptionId,
			ref.orderId,
			ref.subscriptionId,
			STATUS_RIGIDITY[authoritative.status]
		)
		.run();

	if (authoritative.status === 'active' && result.meta.changes > 0) {
		await onSubscriptionBecameActive(env, ref, authoritative.email);
	}

	return { status: 200 };
}
