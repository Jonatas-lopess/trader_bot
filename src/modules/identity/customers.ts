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
