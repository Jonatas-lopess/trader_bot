/**
 * View-model resolver for `/conta` — .scratch/customer-area/issues/03-license-status-page.md.
 *
 * Kept out of `src/pages/conta.astro`'s frontmatter and testable on its own,
 * mirroring this repo's established "thin Astro adapter around a plain
 * module function" convention (`src/modules/billing/checkout.ts`,
 * `src/modules/billing/status.ts`).
 */

import { catalog, type OfferName } from '../../content/catalog';
import { unwrapLaunchBlocking } from '../../shared/launch-blocking';
import { getCustomerEmail, listCustomerPurchases, type PurchaseStatus } from '../identity/customers';
import { requireSession } from '../identity/session';
import { getLicenseStatus, type LicenseStatus } from './license-status';
import { withdrawalAvailable, withdrawalRequestMailto } from './withdrawal';

type AccountPageEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'>;

/** One Licença row on `/conta`: its own purchase, state and Corretora account form. */
export type AccountLicense = {
	purchaseId: string;
	offer: OfferName;
	// The Corretora account the Cliente entered; null until they do.
	corretoraAccount: number | null;
	// Only a Mensal has a recurring Assinatura to cancel; Compra and Anual are one payment.
	canCancel: boolean;
	license: LicenseStatus;
	// The Assinatura's own status, so the page reflects a cancel and hides the cancel action.
	subscriptionStatus: PurchaseStatus;
	// Prefilled `mailto:` to request the 7-day withdrawal; null once the window closed or when there is no paid purchase to withdraw from.
	withdrawalMailto: string | null;
};

/** Every Licença of one Robô the Cliente holds (a repeat buyer can hold several). */
export type AccountRobotGroup = { robotName: string; licenses: AccountLicense[] };

export type AccountView = { ok: true; robots: AccountRobotGroup[] } | { ok: false };

/**
 * Catalog-pivot ticket 14: the session names one email-keyed Cliente, and `/conta` lists every
 * Licença under it on one page, grouped by Robô in order of first purchase.
 */
export async function resolveAccountView(env: AccountPageEnv, request: Request, now = new Date()): Promise<AccountView> {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (!session.ok) return { ok: false };

	const purchases = await listCustomerPurchases(env, session.customerId);
	if (purchases.length === 0) return { ok: false };

	const email = await getCustomerEmail(env, session.customerId);
	if (email === null) return { ok: false };

	// One read for every account number, rather than one per Licença.
	const { results: accounts } = await env.DB.prepare(
		`SELECT l.purchase_id AS purchase_id, l.corretora_account AS corretora_account
		 FROM licenses l JOIN purchases p ON p.id = l.purchase_id WHERE p.customer_id = ?`
	)
		.bind(session.customerId)
		.all<{ purchase_id: string; corretora_account: number | null }>();
	const accountByPurchase = new Map(accounts.map((row) => [row.purchase_id, row.corretora_account]));

	const groups = new Map<string, AccountRobotGroup>();
	for (const purchase of purchases) {
		let group = groups.get(purchase.robotId);
		if (group === undefined) {
			const robot = catalog.find((candidate) => candidate.slug === purchase.robotId);
			group = { robotName: robot ? unwrapLaunchBlocking(robot.name) : purchase.robotId, licenses: [] };
			groups.set(purchase.robotId, group);
		}
		group.licenses.push({
			purchaseId: purchase.purchaseId,
			offer: purchase.offer,
			corretoraAccount: accountByPurchase.get(purchase.purchaseId) ?? null,
			canCancel: purchase.offer === 'monthly' && (purchase.status === 'active' || purchase.status === 'past_due'),
			license: await getLicenseStatus(env, purchase.purchaseId, purchase.status),
			subscriptionStatus: purchase.status,
			withdrawalMailto:
				withdrawalAvailable(purchase, now)
					? withdrawalRequestMailto({ purchaseId: purchase.purchaseId, email })
					: null,
		});
	}
	return { ok: true, robots: [...groups.values()] };
}
