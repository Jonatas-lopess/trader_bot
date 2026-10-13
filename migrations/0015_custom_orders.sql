-- Encomenda (custom-Robô request) leads — .scratch/storefront-v2/issues/14-encomenda-page.md,
-- docs/adr/0008-catalog-in-d1-cart-and-admin.md.
--
-- A submission is stored here first, then e-mailed to the operator. It is a lead, not a
-- purchase: it never creates a Compra, Licença or Cliente (CONTEXT.md). Personal data
-- (name, contact, free text): the privacy placeholder carries a TODO for it.
--
-- At least one of `email` / `phone` is set (enforced by the module, not the schema).
-- `phone` is digits only, DDD + number, no country code. `market` and `corretora` are optional
-- free text ('' when left blank). `notified_at` is set only when the operator e-mail was
-- accepted by Resend; a failed send leaves it NULL and the message sits in `email_dead_letters`
-- (kind `encomenda`), which holds the error detail. Timestamps are UTC ISO-8601 strings.
CREATE TABLE custom_orders (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT,
	phone TEXT,
	strategy TEXT NOT NULL,
	market TEXT NOT NULL DEFAULT '',
	corretora TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	notified_at TEXT
) STRICT;
