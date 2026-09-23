/**
 * Licença status/expiry read — .scratch/customer-area/issues/03-license-status-page.md,
 * PLANNING.md §8. Rows are written by hand for 0.1 ("issuance has a human
 * in it"); this module only reads.
 *
 * `expires_at IS NULL` and "no row at all" are both "sendo preparada" —
 * they collapse to the same result here so `src/pages/conta.astro` doesn't
 * need to special-case a missing row itself.
 */

type LicensingEnv = Pick<Cloudflare.Env, 'DB'>;

export type LicenseStatus =
	| { status: 'preparing'; expiresAt: null }
	| { status: 'active'; expiresAt: string };

export async function getLicenseStatus(env: LicensingEnv, subscriptionId: string): Promise<LicenseStatus> {
	const row = await env.DB.prepare('SELECT expires_at FROM licenses WHERE subscription_id = ?')
		.bind(subscriptionId)
		.first<{ expires_at: string | null }>();

	if (row === null || row.expires_at === null) return { status: 'preparing', expiresAt: null };
	return { status: 'active', expiresAt: row.expires_at };
}
