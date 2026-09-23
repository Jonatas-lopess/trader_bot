-- Licença status/expiry — .scratch/customer-area/issues/03-license-status-page.md,
-- PLANNING.md §8: "Today the robot is an MT5 Expert Advisor licensed by
-- expiry date and issued manually. There is no license server and no
-- per-customer key." No `key` column, deliberately — spec.md's
-- Implementation Decisions is explicit that PLANNING §1/§10's "key/expiry"
-- milestone wording is stale relative to §8's body text.
--
-- Rows are inserted/updated by hand for 0.1 (§8 — "issuance has a human in
-- it"); this effort only reads them. `subscription_id` is the primary key
-- rather than a separate `id` — one Licença per Assinatura in 0.1 (no
-- upgrade/downgrade, PLANNING.md §1), so there is nothing a surrogate key
-- would address that the natural key doesn't already.
--
-- No row for a given subscription, and a row with `expires_at IS NULL`,
-- both mean "sendo preparada" (ticket 03's own acceptance criteria) — the
-- `status` column exists for a human operator's own bookkeeping, but the
-- customer-area page derives its displayed text from `expires_at` alone
-- (spec.md: "sendo preparada (no expires_at set) or ativa até DD/MM (once
-- set)").
CREATE TABLE licenses (
	subscription_id TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'active')),
	expires_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
