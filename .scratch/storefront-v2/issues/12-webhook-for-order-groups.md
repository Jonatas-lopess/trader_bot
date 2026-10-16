# 12: Webhook over an order that holds several purchases

**What to build:** `webhook.ts` and `purchase-lookup.ts` must treat all rows sharing an `appmax_order_id` as one unit (ADR-0008).

- Amount check: `reportedAmountCents` (`amounts.sub_total`) vs **the sum of `amount_cents` of the rows with that order id**, not one row. Mismatch moves all rows to `rejected`, one Sentry report with the order id, expected sum, reported value.
- The compare-and-swap `UPDATE ... WHERE appmax_order_id = ?` already matches every row; keep it one statement, and confirm `meta.changes` handling does not assume 1. `paid_at`, buyer fiscal fields (`COALESCE` first-written) and `licenseSyncStatement` run for each row.
- On `active`: provision the Cliente once (one email, one `customers` row, one magic link) and create **one Licença per row**. Today `onSubscriptionBecameActive` assumes one purchase; make the per-row part a loop and the per-Cliente part run once.
- Refund/chargeback/cancel events move every row of the order (all-or-nothing; Appmax's `order_refund` is for the order). Per-Licença withdrawal by the operator (partial refund) stays manual; document in `docs/ops`.
- Redelivery stays idempotent (`processed_webhooks` composite key unchanged).

**Blocked by:** 10, appmax-checkout 07.

**Status:** done

TDD seam: webhook with D1 real and a mocked authoritative refetch: N-row success, mismatch, redelivery, refund, boleto-then-paid ordering.

- [x] Sum check passes for N rows, rejects a mismatch for all rows
- [x] One Cliente, one login link, N Licenças after activation
- [x] Redelivery and out-of-order events leave the same final state
- [x] Single-row orders behave exactly as before
- [x] Typecheck and the full test suite pass (after merging `main`; see ticket 15 for how the run went)

## Comments

- `checkReportedAmount` sums `amount_cents` over every row matching the order (one aggregate query); a single purchase is a group of one, so its behavior is unchanged. The Sentry `amount mismatch` / `no reported amount` events now carry `order_id` and `rows` next to `purchase_id` (the checkout id, `COALESCE(checkout_id, id)`) and the expected sum; one event per applied CAS, as before.
- The CAS was already one `UPDATE ... WHERE appmax_order_id = ?` over every row; `meta.changes` is only read as `> 0`. `findPurchaseByProviderRef` became `findPurchasesByProviderRef` (all rows, oldest first) and the batch is `[cas, ...one licenseSyncStatement per row]`, each guarded by its own row's status, so N Licenças are created on activation and N are ended on refund or chargeback in the same transaction.
- `provisionCustomer` takes `purchaseIds` and attaches them all in one `UPDATE ... id IN (SELECT value FROM json_each(?))`; `created` is "any row newly attached", so the login link goes out once per order. Same change in `stripe-webhook.ts` (single rows there) and `scripts/provision-customer.ts`, which now attaches every row of the given purchase's checkout.
- `reportMissingBuyerDocument` reports the first row of the order still without a document.
- Ops: `docs/ops/withdrawal-refund.md` gains "One Licença of a cart (partial refund)", manual, with the unverified risk that Appmax moves a partially refunded order to `estornado` (which would refund every row; the doc says how to restore). `docs/ops/rejected-purchases.md` gains how to release a rejected cart as a whole, including creating its Licenças (the SQL flip skips the webhook's activation step, which was also true for single purchases).

