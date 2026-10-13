-- Multi-line purchases — .scratch/storefront-v2/issues/10-multi-item-purchases-schema.md,
-- docs/adr/0008-catalog-in-d1-cart-and-admin.md "Multi-Robô cart on a single Appmax order".
--
-- One `purchases` row per Licença; the rows of one cart checkout share `appmax_order_id` and this
-- `checkout_id`, which equals the `reference` minted for the form (the first row's `id` is that
-- same reference, so a single-line checkout has `checkout_id = id`). Nullable: rows written by
-- code that predates the column stay readable (the status lookup falls back to `id`).
ALTER TABLE purchases ADD COLUMN checkout_id TEXT;

-- Every purchase that exists is its own checkout of one row.
UPDATE purchases SET checkout_id = id WHERE checkout_id IS NULL;

CREATE INDEX idx_purchases_checkout_id ON purchases (checkout_id);
