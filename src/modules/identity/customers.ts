/**
 * Customer identity — .scratch/customer-area/issues/01-customer-identity-provisioning.md.
 *
 * `provisionCustomer` is called from `modules/billing/webhook.ts`'s
 * `onSubscriptionBecameActive` hook, the single identifiable spot a
 * subscription first lands on `active`. Nothing else writes `customers`.
 */

type CustomersEnv = Pick<Cloudflare.Env, 'DB'>;

/**
 * Idempotent by construction: `ON CONFLICT(subscription_id) DO NOTHING` is
 * one atomic statement, no prior `SELECT` — a reapplied `active` webhook
 * event (checkout-webhooks ticket 07's own reapplied-event case) must not
 * duplicate the row for the same subscription (migrations/0003_customers.sql).
 */
export async function provisionCustomer(
	env: CustomersEnv,
	params: { subscriptionId: string; email: string }
): Promise<void> {
	await env.DB.prepare(
		'INSERT INTO customers (id, subscription_id, email) VALUES (?, ?, ?) ON CONFLICT(subscription_id) DO NOTHING'
	)
		// Normalized the same way `requestMagicLink`'s lookup normalizes its
		// input (magic-link.ts) — an email stored verbatim from Appmax's
		// authoritative response (mixed case, stray whitespace) would
		// otherwise never match a login attempt typed in the customer's own
		// casing (code review finding, src/modules/identity/magic-link.ts:46).
		.bind(crypto.randomUUID(), params.subscriptionId, params.email.trim().toLowerCase())
		.run();
}

export type SubscriptionState = 'pending' | 'active' | 'past_due' | 'canceled';

/**
 * The Assinatura + Plano a logged-in Cliente owns — .scratch/customer-area/issues/03-license-status-page.md.
 * Single subscription per customer in 0.1 (spec.md's Implementation
 * Decisions), so one JOIN is enough; no attempt to handle a second
 * Assinatura under the same Cliente. `status`/`appmaxSubscriptionId` added
 * by ticket 04 (.scratch/customer-area/issues/04-cancel-subscription.md) —
 * the page needs the Assinatura's own status to reflect a cancel, and the
 * cancel action needs the Appmax id to call their cancel API.
 */
export async function getCustomerAccount(
	env: CustomersEnv,
	customerId: string
): Promise<{
	subscriptionId: string;
	planId: string;
	status: SubscriptionState;
	appmaxSubscriptionId: string | null;
} | null> {
	const row = await env.DB.prepare(
		`SELECT s.id AS subscription_id, s.plan_id AS plan_id, s.status AS status,
		        s.appmax_subscription_id AS appmax_subscription_id
		 FROM customers c JOIN subscriptions s ON s.id = c.subscription_id
		 WHERE c.id = ?`
	)
		.bind(customerId)
		.first<{
			subscription_id: string;
			plan_id: string;
			status: SubscriptionState;
			appmax_subscription_id: string | null;
		}>();
	if (row === null) return null;
	return {
		subscriptionId: row.subscription_id,
		planId: row.plan_id,
		status: row.status,
		appmaxSubscriptionId: row.appmax_subscription_id,
	};
}
