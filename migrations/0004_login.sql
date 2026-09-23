-- Magic-link login and sessions — .scratch/customer-area/issues/02-magic-link-login.md.
--
-- `login_tokens` is the single-use, 15-minute magic link (spec.md's
-- "Implementation Decisions" — "Magic-link token: 15 minutes, single-use,
-- D1-stored, mirroring the existing processed_webhooks idempotency-by-insert
-- pattern"). Redemption is one statement that both checks and consumes the
-- token — `UPDATE login_tokens SET used_at = ? WHERE token = ? AND used_at
-- IS NULL AND expires_at > ?` — never a `SELECT` then a separate write, same
-- TOCTOU reasoning PLANNING.md §6 gives for the `subscriptions` CAS update.
-- No `REFERENCES` FK to `customers` — this codebase doesn't use them (see
-- `subscriptions.plan_id`, `customers.subscription_id`).
CREATE TABLE login_tokens (
	token TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_login_tokens_customer_id ON login_tokens (customer_id);

-- `sessions` is the revocation store behind spec.md's hybrid session design:
-- a signed cookie (session id, issued-at, expiry — 30 days) is checked on
-- every ordinary request with no DB round-trip (PLANNING.md §3), while this
-- table is written at login and consulted only at logout and (ticket 04)
-- the cancel-subscription action — the two sensitive operations spec.md
-- calls out, never on ordinary page loads.
CREATE TABLE sessions (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_sessions_customer_id ON sessions (customer_id);
