-- Download-link tokens for the robot binary — .scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md,
-- PLANNING.md §8 "Licensing and delivery": "An opaque token is stored in D1
-- with a 24-48h TTL and a `used_at` column." `used_at` is telemetry only,
-- never a redemption gate — the grill settled the download link as reusable
-- within its TTL, not single-use (unlike `login_tokens`, which IS consumed
-- on first redemption — migrations/0004_login.sql). No `REFERENCES` FK to
-- `customers` — this codebase doesn't use them (see `login_tokens.customer_id`,
-- `subscriptions.plan_id`).
CREATE TABLE download_tokens (
	token TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_download_tokens_customer_id ON download_tokens (customer_id);
