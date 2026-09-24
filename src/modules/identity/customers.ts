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
 *
 * `created` tells the caller (`webhook.ts`'s `onSubscriptionBecameActive`)
 * whether this call actually inserted the row versus hit the `ON CONFLICT`
 * no-op — a reapplied/renewal event resolving to `created: false` is how
 * that caller knows not to re-issue a magic link on every renewal, only on
 * the subscription's first activation (customer-area ticket 06).
 */
export async function provisionCustomer(
	env: CustomersEnv,
	params: { subscriptionId: string; email: string }
): Promise<{ id: string; created: boolean }> {
	const id = crypto.randomUUID();
	const result = await env.DB.prepare(
		'INSERT INTO customers (id, subscription_id, email) VALUES (?, ?, ?) ON CONFLICT(subscription_id) DO NOTHING'
	)
		// Normalized the same way `requestMagicLink`'s lookup normalizes its
		// input (magic-link.ts) — an email stored verbatim from Appmax's
		// authoritative response (mixed case, stray whitespace) would
		// otherwise never match a login attempt typed in the customer's own
		// casing (code review finding, src/modules/identity/magic-link.ts:46).
		.bind(id, params.subscriptionId, params.email.trim().toLowerCase())
		.run();

	if (result.meta.changes > 0) return { id, created: true };

	// Conflict hit — another delivery for this subscription already
	// provisioned it. Not a TOCTOU read: the conflict itself was already
	// decided atomically by the `INSERT` above; this only resolves which
	// id that earlier insert used.
	const existing = await env.DB.prepare('SELECT id FROM customers WHERE subscription_id = ?')
		.bind(params.subscriptionId)
		.first<{ id: string }>();
	return { id: existing!.id, created: false };
}

/**
 * Read-only lookup by `customers.id` — .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md's
 * ops-run CLI script needs the Cliente's email to dispatch the download
 * link, given only a `--customer-id=` argument. `identity` owns the
 * `customers` table's reads/writes (PLANNING.md §4); `modules/licensing`
 * imports this directly rather than duplicating a customers query, the same
 * "modules import each other directly" convention `account-page.ts` already
 * follows for `getCustomerAccount`.
 */
export async function getCustomerEmail(env: CustomersEnv, customerId: string): Promise<string | null> {
	const row = await env.DB.prepare('SELECT email FROM customers WHERE id = ?')
		.bind(customerId)
		.first<{ email: string }>();
	return row?.email ?? null;
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
