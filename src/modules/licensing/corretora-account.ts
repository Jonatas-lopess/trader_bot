/**
 * Corretora account entry — .scratch/catalog-pivot/issues/07-customer-area-license-states.md,
 * ADR-0006 "Corretora account is collected after payment".
 *
 * The Cliente types the account number the Robô will run against once, after paying. It is
 * written once (a second submit never overwrites — changing it is operator-only in 0.1, since
 * the binary is compiled against it) and moves the Licença `awaiting_account` -> `preparing`.
 */

type LicensingEnv = Pick<Cloudflare.Env, 'DB'>;

export type SaveCorretoraAccountResult =
	| { ok: true }
	| { ok: false; reason: 'invalid' | 'already_set' | 'no_license' };

// Positive integer, no leading zero, at most 12 digits (safely inside SQLite/JS integers).
const ACCOUNT_PATTERN = /^[1-9]\d{0,11}$/;

export async function saveCorretoraAccount(
	env: LicensingEnv,
	purchaseId: string,
	rawAccount: string
): Promise<SaveCorretoraAccountResult> {
	const trimmed = rawAccount.trim();
	if (!ACCOUNT_PATTERN.test(trimmed)) return { ok: false, reason: 'invalid' };

	// One atomic statement: the `corretora_account IS NULL` guard is the write-once rule, and
	// the purchase guard keeps a Licença whose payment is held (`rejected`, `pending`) or revoked from being prepared. `canceled` still qualifies: the paid term stands.
	const result = await env.DB.prepare(
		`UPDATE licenses
		 SET corretora_account = ?, status = 'preparing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE purchase_id = ? AND corretora_account IS NULL AND status = 'awaiting_account'
		   AND EXISTS (SELECT 1 FROM purchases WHERE id = ? AND status IN ('active', 'past_due', 'canceled'))`
	)
		.bind(Number(trimmed), purchaseId, purchaseId)
		.run();
	if (result.meta.changes > 0) return { ok: true };

	const existing = await env.DB.prepare(
		`SELECT l.corretora_account AS corretora_account, p.status AS purchase_status
		 FROM licenses l JOIN purchases p ON p.id = l.purchase_id WHERE l.purchase_id = ?`
	)
		.bind(purchaseId)
		.first<{ corretora_account: number | null; purchase_status: string }>();
	if (existing === null || !['active', 'past_due', 'canceled'].includes(existing.purchase_status)) {
		return { ok: false, reason: 'no_license' };
	}
	return { ok: false, reason: 'already_set' };
}
