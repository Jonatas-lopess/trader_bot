# 10: Schema and pricing for multi-line purchases

**What to build:** Migration adding `purchases.checkout_id TEXT` (nullable, indexed; backfilled with `id` for existing rows, i.e. every old purchase is its own checkout) and the server-side pricing of N lines. One `purchases` row per Licença, rows of one checkout share `checkout_id` and `appmax_order_id` (ADR-0008).

- Decide and record: `checkout_id` equals the `reference` minted for the form (appmax-checkout 02) and each row's `id` is a fresh UUID, **or** the first row reuses it. Note that appmax-checkout makes `purchases.id = reference` and the confirmation page polls by `ref`; the status endpoint must accept a `checkout_id` and answer for the group (aggregate: all rows `active` → active; any `rejected` → rejected; else pending). Define the aggregation as one pure function with the rank ordering of ADR-0006.
- `modules/billing/purchase-lookup.ts`: add `findByCheckout`. Existing single-row lookups keep working.
- `priceCheckout(env, lines)`: uses 09's `price-cart` + D1 `lookupOffer`, expands quantity into per-Licença rows `{robotId, offer, amountCents}`, returns the total and the Appmax `products[]` (`sku` = `<robot>:<offer>`, `quantity` 1 each or grouped, `unit_value` cents). Unknown/draft lines reject the whole checkout (no partial).
- `schema.test.ts` updated; `STATUS_RIGIDITY` comment unchanged in meaning.

**Blocked by:** 03.

**Status:** done

TDD seam: the group status aggregation (pure), `priceCheckout` (D1), backfill on a pre-populated DB.

- [x] Existing purchases keep working with `checkout_id = id`
- [x] A 2-line, quantity-3 cart prices to 4+ rows and the right total from D1, ignoring client prices
- [x] Group status aggregation covered for every rank combination that can occur
- [x] Typecheck and the full test suite pass

## Comments

- **`checkout_id` = `reference`, and the first row's `id` is that same reference.** The other rows of the
  checkout get fresh UUIDs. This keeps appmax-checkout 05 intact: `purchases.id = reference`, a primary-key
  conflict on a repeated POST is still the idempotency signal (insert all rows in one `DB.batch`, so the
  group is all-or-nothing), and the confirmation page keeps polling `?ref=<reference>`. A single-line checkout
  is exactly an old row (`checkout_id = id`). The cost is one asymmetric row per group; 11 must write
  `checkout_id` on every row it inserts.
- Migration `0013_purchase_checkout_id.sql`: nullable column, backfill `checkout_id = id`, index. Nullable
  because other code paths (the Stripe `checkout.ts` insert, test seeds) still insert without it; `findByCheckout`
  matches `checkout_id = ?` or (`checkout_id IS NULL` and `id = ?`), so those rows keep answering for themselves.
  The backfill is tested by re-running the migration's own UPDATE over old-style rows (`schema.test.ts`).
- `aggregateCheckoutStatus` (pure, `modules/billing/status.ts`): any `rejected` is `rejected`; else any
  `pending` is `pending` (`awaiting_boleto` for a boleto); else the highest `STATUS_RIGIDITY` wins, so one
  refunded or charged-back Licença is not masked by `active` siblings. Rows of an order normally move together
  (ADR-0008's single CAS), so mixed groups only arise from manual partial refunds. `/billing/status` accepts
  `checkout_id` (falling back to `ref`); the response shape is unchanged.
- `priceCheckout(env, lines)` lives in `modules/billing/price-checkout.ts`, self-contained (09 was built in
  parallel). Lines are untrusted `{robotId, offer, quantity}`; quantity must be an integer 1..5
  (`MAX_LINE_QUANTITY`), at most 20 lines (`MAX_LINES`, bounds D1 reads). Returns `{ok, rows, totalCents,
  products}` or `{ok:false, reason, line?}`; any bad line rejects the whole checkout. Names come from
  `listRobotNames` (one query), prices from `lookupOffer`.
- **Overlap with 09:** the pure expansion/summing is `expandLines` in `modules/billing/checkout-lines.ts`
  (`PricedLine` in, `rows`/`totalCents`/`products` out, no D1). 09's `price-cart.ts` can import it for its
  total, or keep its own per-line arithmetic and drop it when merging; `priceCheckout` is the checkout-side
  entry either way. `MAX_LINE_QUANTITY` is also defined here and should become the cart's single source.
- `AppmaxProduct` is typed in `checkout-lines.ts`; `appmax-client.ts` `createOrder` still takes one
  `sku`/`amountCents` and was not touched (11 passes `products`).
