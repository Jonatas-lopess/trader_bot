-- Identity per email — .scratch/catalog-pivot/issues/14-identity-per-email.md,
-- docs/adr/0006-catalog-pivot.md "Identity is per email" and "Reset, not migrate".
--
-- One `customers` row per normalized email (src/modules/identity/normalize-email.ts), with many
-- purchases under it. The Cliente-to-purchase link moves to `purchases.customer_id`, set when the
-- purchase is provisioned; `customers.purchase_id` (UNIQUE, one row per purchase) is gone.
--
-- Reset, not merge: only test-phase data exists (the D1 databases were checked empty on
-- 2026-09-29), so there is no dedupe or backfill. Purchases and their dependents are cleared
-- rather than left with no owner. `processed_webhooks` / `webhook_deliveries` are keyed by
-- gateway ids and stay.
DROP TABLE customers;
DELETE FROM licenses;
DELETE FROM download_tokens;
DELETE FROM purchases;
DELETE FROM login_tokens;
DELETE FROM sessions;

CREATE TABLE customers (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Nullable: a purchase has no Cliente until it first activates and provisioning attaches it.
ALTER TABLE purchases ADD COLUMN customer_id TEXT;
CREATE INDEX idx_purchases_customer_id ON purchases (customer_id);
