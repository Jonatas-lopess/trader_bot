-- Catalog pivot — .scratch/catalog-pivot/issues/02-purchases-migration.md,
-- docs/adr/0006-catalog-pivot.md "Purchase table and status ranking" and
-- "Reset, not migrate".
--
-- Only test-phase data exists, so the plan-keyed tables are dropped and
-- recreated rather than migrated. `processed_webhooks` / `webhook_deliveries`
-- are keyed by gateway ids, not plans, and stay. `login_tokens` and `sessions` have no FK to
-- `customers` (this codebase uses none), so their rows are cleared instead of
-- being left pointing at customers that no longer exist.
DROP TABLE subscriptions;
DROP TABLE customers;
DROP TABLE licenses;
DROP TABLE download_tokens;
DELETE FROM login_tokens;
DELETE FROM sessions;

-- `purchases` replaces `subscriptions`: one row per checkout attempt for one
-- Robô. `robot_id` is a slug from src/content/catalog.ts (no FK — the catalog
-- is a bundled content file, not a table). `amount_cents` is the price the
-- server looked up at session creation; the webhook compares the gateway's
-- reported amount against it, never against the live catalog (PLANNING.md §6
-- "Price integrity").
--
-- `status` is rank-ordered (see STATUS_RIGIDITY in
-- src/modules/billing/purchase-lookup.ts): pending < rejected < active <
-- past_due < canceled < refunded < chargeback. Keep the two in sync.
--
-- `provider` and the two gateway id columns keep their 0001/0007 names for
-- the reasons in 0007: `appmax_*` holds whichever gateway `provider` names.
CREATE TABLE purchases (
	id TEXT PRIMARY KEY,
	robot_id TEXT NOT NULL,
	offer TEXT NOT NULL CHECK (offer IN ('one_time', 'annual', 'monthly')),
	amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
	status TEXT NOT NULL CHECK (
		status IN ('pending', 'rejected', 'active', 'past_due', 'canceled', 'refunded', 'chargeback')
	),
	payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('card', 'boleto', 'pix')),
	provider TEXT NOT NULL DEFAULT 'appmax' CHECK (provider IN ('appmax', 'stripe')),
	appmax_order_id TEXT,
	appmax_subscription_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_purchases_appmax_order_id ON purchases (appmax_order_id);
CREATE INDEX idx_purchases_appmax_subscription_id ON purchases (appmax_subscription_id);

-- Same shape as 0003, keyed by the purchase that first activated it. NOTE:
-- one `customers` row per purchase means a second purchase by the same email
-- creates a second row; consolidating identity per email is left to the
-- customer-area tickets (catalog-pivot 07/08).
CREATE TABLE customers (
	id TEXT PRIMARY KEY,
	purchase_id TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_customers_email ON customers (email);

-- One Licença per purchase, so `purchase_id` is the primary key and doubles as
-- the license id (`licenses/<license_id>.ex5`, download_tokens.license_id).
-- `corretora_account` is the Corretora account number the Cliente enters in
-- the customer area after payment; nullable until then and it blocks download
-- (ADR-0006). Status: awaiting_account -> preparing -> active. Expiry is
-- derived from purchase status by one function (ticket 05); `expires_at`
-- stays a plain column until then.
CREATE TABLE licenses (
	purchase_id TEXT PRIMARY KEY,
	robot_id TEXT NOT NULL,
	corretora_account INTEGER,
	status TEXT NOT NULL DEFAULT 'awaiting_account' CHECK (status IN ('awaiting_account', 'preparing', 'active')),
	expires_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Per-Licença delivery: a token names the Licença whose binary it serves.
-- Nullable until catalog-pivot ticket 08 makes minting per-Licença; that
-- ticket owns tightening it.
CREATE TABLE download_tokens (
	token TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL,
	license_id TEXT,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_download_tokens_customer_id ON download_tokens (customer_id);
CREATE INDEX idx_download_tokens_license_id ON download_tokens (license_id);
