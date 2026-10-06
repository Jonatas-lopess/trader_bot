/**
 * Customer identity — .scratch/customer-area/issues/01-customer-identity-provisioning.md.
 *
 * `provisionCustomer` is called from `modules/billing/webhook.ts`'s
 * `onSubscriptionBecameActive` hook, the single identifiable spot a
 * subscription first lands on `active`. Nothing else writes `customers`.
 */

import type { OfferName } from '../../content/catalog';
import { normalizeEmail } from './normalize-email';
import type { ProviderId, PurchaseStatus } from '../billing/payment-provider';

type CustomersEnv = Pick<Cloudflare.Env, 'DB'>;

/**
 * Find-or-create the Cliente by normalized email, then attach the purchase to it
 * (`purchases.customer_id`, migration 0011; ADR-0006 "Identity is per email"). A repeat buyer
 * resolves to the same `customers` row however the address is cased or padded.
 *
 * `created` means "this purchase was newly attached", not "a customers row was inserted": the
 * caller (`webhook.ts`'s `onSubscriptionBecameActive`) gates the duplicate-Licença report and the
 * magic-link send on it, so a reapplied or renewal event for an already-attached purchase is a
 * no-op, while a repeat buyer's second purchase still gets its own link.
 *
 * Both writes are single atomic statements (`ON CONFLICT(email) DO NOTHING`, then
 * `UPDATE ... WHERE customer_id IS NULL`); the `SELECT` between them only resolves the id the
 * conflict decision already fixed. Returns `null` for a malformed email: callers reject, never
 * fall back to the raw value.
 */
export async function provisionCustomer(
	env: CustomersEnv,
	params: { purchaseId: string; email: string }
): Promise<{ id: string; created: boolean } | null> {
	const email = normalizeEmail(params.email);
	if (email === null) return null;

	await env.DB.prepare('INSERT INTO customers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
		.bind(crypto.randomUUID(), email)
		.run();
	const customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind(email).first<{ id: string }>();

	const attached = await env.DB.prepare('UPDATE purchases SET customer_id = ? WHERE id = ? AND customer_id IS NULL')
		.bind(customer!.id, params.purchaseId)
		.run();
	if (attached.meta.changes > 0) return { id: customer!.id, created: true };

	// Already attached by an earlier delivery: report the Cliente it belongs to.
	const owner = await env.DB.prepare('SELECT customer_id FROM purchases WHERE id = ?')
		.bind(params.purchaseId)
		.first<{ customer_id: string | null }>();
	return { id: owner?.customer_id ?? customer!.id, created: false };
}

/**
 * The Cliente behind a Licença (`license_id` = `purchase_id`) — catalog-pivot ticket 08:
 * delivery is per-Licença, so dispatch starts from the Licença and needs whose email
 * receives the link and whose id the token records.
 */
export async function getCustomerByPurchaseId(
	env: CustomersEnv,
	purchaseId: string
): Promise<{ id: string; email: string } | null> {
	return env.DB.prepare('SELECT c.id AS id, c.email AS email FROM purchases p JOIN customers c ON c.id = p.customer_id WHERE p.id = ?')
		.bind(purchaseId)
		.first<{ id: string; email: string }>();
}

/** The Cliente's e-mail by id (the session names the id); `null` when no such Cliente. */
export async function getCustomerEmail(env: CustomersEnv, customerId: string): Promise<string | null> {
	const row = await env.DB.prepare('SELECT email FROM customers WHERE id = ?').bind(customerId).first<{ email: string }>();
	return row?.email ?? null;
}

export type { PurchaseStatus };

/** One purchase a Cliente owns, as `/conta` and its actions need it. */
export type CustomerPurchase = {
	purchaseId: string;
	robotId: string;
	offer: OfferName;
	status: PurchaseStatus;
	provider: ProviderId;
	appmaxSubscriptionId: string | null;
	createdAt: string;
};

type PurchaseRow = {
	purchase_id: string;
	robot_id: string;
	offer: OfferName;
	status: PurchaseStatus;
	provider: ProviderId;
	appmax_subscription_id: string | null;
	created_at: string;
};

const PURCHASE_COLUMNS = `id AS purchase_id, robot_id, offer, status, provider, appmax_subscription_id, created_at`;

function toCustomerPurchase(row: PurchaseRow): CustomerPurchase {
	return {
		purchaseId: row.purchase_id,
		robotId: row.robot_id,
		offer: row.offer,
		status: row.status,
		provider: row.provider,
		appmaxSubscriptionId: row.appmax_subscription_id,
		createdAt: row.created_at,
	};
}

/**
 * Every Compra the Cliente owns, oldest first — catalog-pivot ticket 14: `/conta` lists all
 * Licenças of an email-keyed Cliente on one page. `customerId` comes from the session, so a
 * Cliente never sees another's rows.
 */
export async function listCustomerPurchases(env: CustomersEnv, customerId: string): Promise<CustomerPurchase[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE customer_id = ? ORDER BY created_at, id`
	)
		.bind(customerId)
		.all<PurchaseRow>();
	return results.map(toCustomerPurchase);
}

/**
 * One purchase, only if it belongs to this Cliente. The per-purchase actions
 * (`/conta/corretora`, `/conta/cancelar`) take a `purchase_id` from a form, so ownership is
 * checked here rather than trusting the posted id.
 */
export async function getCustomerPurchase(
	env: CustomersEnv,
	customerId: string,
	purchaseId: string
): Promise<CustomerPurchase | null> {
	const row = await env.DB.prepare(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE id = ? AND customer_id = ?`)
		.bind(purchaseId, customerId)
		.first<PurchaseRow>();
	return row === null ? null : toCustomerPurchase(row);
}
