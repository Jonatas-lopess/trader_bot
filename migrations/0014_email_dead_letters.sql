-- E-mail dead letter — .scratch/storefront-v2/issues/16-email-dead-letter.md,
-- docs/adr/0008-catalog-in-d1-cart-and-admin.md.
--
-- A send through `sendOrParkEmail` that Resend rejects (or that never reaches Resend) is parked
-- here instead of being lost, and an admin resends it from /admin/emails. A successful send
-- inserts nothing.
--
-- `kind` names the sender (`encomenda` for ticket 14). `body` is the plain-text body and is
-- NULL when the caller passed `storeBody: false` (e-mails that carry a secret, such as a magic
-- link, must never be stored here); a row without a body cannot be resent. `last_error` is the
-- provider's rejection reason, never a secret or an API key. `attempts` counts every send
-- attempt including the first, failed one; `last_attempt_at` doubles as the short lease that
-- keeps a double click from sending twice. Timestamps are UTC ISO-8601 strings.
CREATE TABLE email_dead_letters (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	to_address TEXT NOT NULL,
	reply_to TEXT,
	subject TEXT NOT NULL,
	body TEXT,
	attempts INTEGER NOT NULL DEFAULT 1,
	last_error TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	last_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	resolved_at TEXT
) STRICT;

CREATE INDEX idx_email_dead_letters_unresolved ON email_dead_letters (created_at) WHERE resolved_at IS NULL;
