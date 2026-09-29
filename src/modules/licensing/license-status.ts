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

export async function getLicenseStatus(env: LicensingEnv, purchaseId: string): Promise<LicenseStatus> {
	const row = await env.DB.prepare('SELECT status, expires_at FROM licenses WHERE purchase_id = ?')
		.bind(purchaseId)
		.first<{ status: string; expires_at: string | null }>();

	// The webhook now creates the row (with its derived expiry) on activation, while the
	// binary is still to be prepared, so an expiry alone no longer means "active".
	if (row === null || row.status !== 'active' || row.expires_at === null) return { status: 'preparing', expiresAt: null };
	return { status: 'active', expiresAt: row.expires_at };
}
