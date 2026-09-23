/**
 * View-model resolver for `/conta` — .scratch/customer-area/issues/03-license-status-page.md.
 *
 * Kept out of `src/pages/conta.astro`'s frontmatter and testable on its own,
 * mirroring this repo's established "thin Astro adapter around a plain
 * module function" convention (`src/modules/billing/checkout.ts`,
 * `src/modules/billing/status.ts`).
 */

import { plans } from '../../content/plans';
import { getCustomerAccount } from '../identity/customers';
import { requireSession } from '../identity/session';
import { getLicenseStatus, type LicenseStatus } from './license-status';

type AccountPageEnv = Pick<Cloudflare.Env, 'DB' | 'SESSION_SECRET'>;

export type AccountView =
	| { ok: true; planName: string; license: LicenseStatus }
	| { ok: false };

export async function resolveAccountView(env: AccountPageEnv, request: Request): Promise<AccountView> {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (!session.ok) return { ok: false };

	const account = await getCustomerAccount(env, session.customerId);
	if (account === null) return { ok: false };

	const plan = plans.find((candidate) => candidate.id === account.planId);
	const license = await getLicenseStatus(env, account.subscriptionId);

	return { ok: true, planName: plan?.name ?? account.planId, license };
}
