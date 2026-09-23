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
		.bind(crypto.randomUUID(), params.subscriptionId, params.email)
		.run();
}

/**
 * The Assinatura + Plano a logged-in Cliente owns — .scratch/customer-area/issues/03-license-status-page.md.
 * Single subscription per customer in 0.1 (spec.md's Implementation
 * Decisions), so one JOIN is enough; no attempt to handle a second
 * Assinatura under the same Cliente.
 */
export async function getCustomerAccount(
	env: CustomersEnv,
	customerId: string
): Promise<{ subscriptionId: string; planId: string } | null> {
	const row = await env.DB.prepare(
		`SELECT s.id AS subscription_id, s.plan_id AS plan_id
		 FROM customers c JOIN subscriptions s ON s.id = c.subscription_id
		 WHERE c.id = ?`
	)
		.bind(customerId)
		.first<{ subscription_id: string; plan_id: string }>();
	if (row === null) return null;
	return { subscriptionId: row.subscription_id, planId: row.plan_id };
}
