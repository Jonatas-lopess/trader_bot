/**
 * Licença state read — .scratch/customer-area/issues/03-license-status-page.md,
 * .scratch/catalog-pivot/issues/07-customer-area-license-states.md, PLANNING.md §8.
 *
 * `licenses.status` (`awaiting_account` -> `preparing` -> `active`) only says how far
 * issuance got; whether the Licença is still usable also depends on the purchase (refund or
 * chargeback revoke it) and on `expires_at` (a lapsed term). Both are folded in here so
 * `src/pages/conta.astro` renders one state and never re-derives it.
 *
 * `none` = no row: the webhook creates it on the first `active`, so a `pending` or `rejected`
 * purchase has no Licença yet.
 */

import type { PurchaseStatus } from '../billing/payment-provider';

type LicensingEnv = Pick<Cloudflare.Env, 'DB'>;

export type LicenseStatus =
	| { status: 'none' }
	| { status: 'awaiting_account' }
	| { status: 'preparing' }
	| { status: 'active'; expiresAt: string }
	| { status: 'expired'; expiresAt: string }
	| { status: 'revoked' };

export async function getLicenseStatus(
	env: LicensingEnv,
	purchaseId: string,
	purchaseStatus: PurchaseStatus,
	now: Date = new Date()
): Promise<LicenseStatus> {
	const row = await env.DB.prepare('SELECT status, expires_at FROM licenses WHERE purchase_id = ?')
		.bind(purchaseId)
		.first<{ status: 'awaiting_account' | 'preparing' | 'active'; expires_at: string | null }>();
	if (purchaseStatus === 'refunded' || purchaseStatus === 'chargeback') return { status: 'revoked' };
	if (row === null) return { status: 'none' };
	if (row.status !== 'active' || row.expires_at === null) return { status: row.status === 'active' ? 'preparing' : row.status };
	if (new Date(row.expires_at) <= now) return { status: 'expired', expiresAt: row.expires_at };
	return { status: 'active', expiresAt: row.expires_at };
}

/**
 * Same state as `getLicenseStatus`, resolved from the Licença id alone (`license_id` =
 * `purchase_id`): mint and redeem only hold the id, not the purchase status. A missing
 * purchase reads as `none`.
 */
export async function getLicenseStatusById(env: LicensingEnv, licenseId: string, now: Date = new Date()): Promise<LicenseStatus> {
	const purchase = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?')
		.bind(licenseId)
		.first<{ status: PurchaseStatus }>();
	if (purchase === null) return { status: 'none' };
	return getLicenseStatus(env, licenseId, purchase.status, now);
}
