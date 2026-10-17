/**
 * What both gateways' webhook handlers (webhook.ts for Appmax, stripe-webhook.ts for Stripe) do to
 * every purchase row of one order (a cart is one row per Licença, ADR-0008). Kept in one place so
 * the two handlers cannot drift on how a status reaches the Licenças or the Cliente.
 */

import { provisionCustomer } from '../identity/customers';
import { licenseSyncStatement } from '../licensing/license-expiry';
import type { ProviderId, PurchaseStatus } from './payment-provider';
import { findPurchasesByProviderRef } from './purchase-lookup';

type OrderEnv = Pick<Cloudflare.Env, 'DB'>;
type ProviderRef = { orderId: string | null; subscriptionId: string | null };

/**
 * One Licença expiry statement per row of the order (license-expiry.ts), each guarded by its own
 * row's status, for the caller to batch with the status CAS (one transaction).
 */
export async function orderLicenseSyncStatements(
	env: OrderEnv,
	provider: ProviderId,
	ref: ProviderRef,
	status: PurchaseStatus,
	now: Date
): Promise<D1PreparedStatement[]> {
	const purchases = await findPurchasesByProviderRef(env, provider, ref);
	return purchases.flatMap((purchase) => {
		const statement = licenseSyncStatement(env, { purchaseId: purchase.id, robotId: purchase.robotId, offer: purchase.offer, status, now });
		return statement === null ? [] : [statement];
	});
}

export type OrderCustomer =
	| { kind: 'no_rows' }
	/** Never falls back to the raw value (normalize-email.ts); `purchaseId` is the order's first row, for the report. */
	| { kind: 'malformed_email'; purchaseId: string }
	| { kind: 'provisioned'; customer: { id: string; created: boolean } };

/** One Cliente for every row of the order (`provisionCustomer` attaches the rows not yet attached). */
export async function provisionOrderCustomer(env: OrderEnv, provider: ProviderId, ref: ProviderRef, email: string): Promise<OrderCustomer> {
	const purchases = await findPurchasesByProviderRef(env, provider, ref);
	if (purchases.length === 0) return { kind: 'no_rows' };
	const customer = await provisionCustomer(env, { purchaseIds: purchases.map((purchase) => purchase.id), email });
	return customer === null ? { kind: 'malformed_email', purchaseId: purchases[0].id } : { kind: 'provisioned', customer };
}
