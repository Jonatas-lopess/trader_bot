/**
 * Operator flip `preparing` -> `active` — .scratch/catalog-pivot/issues/08-per-license-delivery.md,
 * PLANNING.md §8 step 4, ADR-0006. Run by `scripts/activate-license.ts` once the operator has
 * compiled the binary for the bound Corretora account and uploaded `licenses/<license_id>.ex5`;
 * runbook in `docs/ops/license-activation.md`. Nothing else sets `licenses.status = 'active'`.
 *
 * Refuses to flip when the object is not in R2 (an active Licença with no binary would
 * page on every download) or when the purchase is not paid/revoked, and emails the link.
 * The flip is one atomic `UPDATE`, so two operators running it at once cannot double-send.
 */

import type { PurchaseStatus } from '../billing/payment-provider';
import { getCustomerByPurchaseId } from '../identity/customers.ts';
import { dispatchDownloadLink, type DispatchDownloadLinkResult } from './dispatch.ts';
import { licenseBinaryKey } from './robot-binary';

type ActivateEnv = Pick<Cloudflare.Env, 'DB' | 'ROBOT_BINARY' | 'RESEND_API_KEY'>;

export type ActivateLicenseResult =
	| DispatchDownloadLinkResult
	| { ok: false; reason: 'not_preparing' | 'binary_missing' | 'purchase_not_payable' };

// A Licença is owed while the purchase is paid or its paid term stands (see
// `corretora-account.ts`); a refunded/chargeback/held purchase must not go live.
const PAYABLE: PurchaseStatus[] = ['active', 'past_due', 'canceled'];

export async function activateLicense(
	env: ActivateEnv,
	params: { licenseId: string; origin: string }
): Promise<ActivateLicenseResult> {
	const purchase = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?')
		.bind(params.licenseId)
		.first<{ status: PurchaseStatus }>();
	if (purchase === null || !PAYABLE.includes(purchase.status)) return { ok: false, reason: 'purchase_not_payable' };

	if ((await env.ROBOT_BINARY.head(licenseBinaryKey(params.licenseId))) === null) {
		return { ok: false, reason: 'binary_missing' };
	}

	// Checked before the flip: a Licença flipped with nobody to email would need a manual resend.
	if ((await getCustomerByPurchaseId(env, params.licenseId)) === null) return { ok: false, reason: 'customer_not_found' };

	const flipped = await env.DB.prepare(
		"UPDATE licenses SET status = 'active', updated_at = ? WHERE purchase_id = ? AND status = 'preparing'"
	)
		.bind(new Date().toISOString(), params.licenseId)
		.run();
	if (flipped.meta.changes === 0) return { ok: false, reason: 'not_preparing' };

	return dispatchDownloadLink(env, params);
}
