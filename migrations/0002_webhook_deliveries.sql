-- Splits the raw-payload log out of `processed_webhooks` (0001_billing_schema.sql).
--
-- spec.md's Webhook trust model has two separate bullets: raw payload
-- storage happens "before processing, independent of the idempotency
-- check" (every delivery, including a duplicate), while the idempotency
-- INSERT's uniqueness violation "is the already processed signal" (user
-- story 6) — its own D1 concurrency section shows that INSERT as
-- `INSERT INTO processed_webhooks (id) VALUES (?)`, no payload column.
-- 0001 conflated the two into one INSERT whose uniqueness violation on a
-- duplicate delivery would silently drop that duplicate's payload — losing
-- exactly the "diagnose a replay/retry-storm" case user story 7 wants.
ALTER TABLE processed_webhooks DROP COLUMN payload;

-- Unconditional log: one row per delivery, duplicates included, written
-- before the idempotency check so it never depends on that check's outcome.
CREATE TABLE webhook_deliveries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	idempotency_key TEXT NOT NULL,
	payload TEXT NOT NULL,
	received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_webhook_deliveries_idempotency_key ON webhook_deliveries (idempotency_key);
