# 10: Schema and pricing for multi-line purchases

**What to build:** Migration adding `purchases.checkout_id TEXT` (nullable, indexed; backfilled with `id` for existing rows, i.e. every old purchase is its own checkout) and the server-side pricing of N lines. One `purchases` row per Licença, rows of one checkout share `checkout_id` and `appmax_order_id` (ADR-0008).

- Decide and record: `checkout_id` equals the `reference` minted for the form (appmax-checkout 02) and each row's `id` is a fresh UUID, **or** the first row reuses it. Note that appmax-checkout makes `purchases.id = reference` and the confirmation page polls by `ref`; the status endpoint must accept a `checkout_id` and answer for the group (aggregate: all rows `active` → active; any `rejected` → rejected; else pending). Define the aggregation as one pure function with the rank ordering of ADR-0006.
- `modules/billing/purchase-lookup.ts`: add `findByCheckout`. Existing single-row lookups keep working.
- `priceCheckout(env, lines)`: uses 09's `price-cart` + D1 `lookupOffer`, expands quantity into per-Licença rows `{robotId, offer, amountCents}`, returns the total and the Appmax `products[]` (`sku` = `<robot>:<offer>`, `quantity` 1 each or grouped, `unit_value` cents). Unknown/draft lines reject the whole checkout (no partial).
- `schema.test.ts` updated; `STATUS_RIGIDITY` comment unchanged in meaning.

**Blocked by:** 03.

**Status:** ready-for-agent

TDD seam: the group status aggregation (pure), `priceCheckout` (D1), backfill on a pre-populated DB.

- [ ] Existing purchases keep working with `checkout_id = id`
- [ ] A 2-line, quantity-3 cart prices to 4+ rows and the right total from D1, ignoring client prices
- [ ] Group status aggregation covered for every rank combination that can occur
- [ ] Typecheck and the full test suite pass
