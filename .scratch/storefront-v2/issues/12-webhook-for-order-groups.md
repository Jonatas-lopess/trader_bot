# 12: Webhook over an order that holds several purchases

**What to build:** `webhook.ts` and `purchase-lookup.ts` must treat all rows sharing an `appmax_order_id` as one unit (ADR-0008).

- Amount check: `reportedAmountCents` (`amounts.sub_total`) vs **the sum of `amount_cents` of the rows with that order id**, not one row. Mismatch moves all rows to `rejected`, one Sentry report with the order id, expected sum, reported value.
- The compare-and-swap `UPDATE ... WHERE appmax_order_id = ?` already matches every row; keep it one statement, and confirm `meta.changes` handling does not assume 1. `paid_at`, buyer fiscal fields (`COALESCE` first-written) and `licenseSyncStatement` run for each row.
- On `active`: provision the Cliente once (one email, one `customers` row, one magic link) and create **one Licença per row**. Today `onSubscriptionBecameActive` assumes one purchase; make the per-row part a loop and the per-Cliente part run once.
- Refund/chargeback/cancel events move every row of the order (all-or-nothing; Appmax's `order_refund` is for the order). Per-Licença withdrawal by the operator (partial refund) stays manual; document in `docs/ops`.
- Redelivery stays idempotent (`processed_webhooks` composite key unchanged).

**Blocked by:** 10, appmax-checkout 07.

**Status:** ready-for-agent

TDD seam: webhook with D1 real and a mocked authoritative refetch: N-row success, mismatch, redelivery, refund, boleto-then-paid ordering.

- [ ] Sum check passes for N rows, rejects a mismatch for all rows
- [ ] One Cliente, one login link, N Licenças after activation
- [ ] Redelivery and out-of-order events leave the same final state
- [ ] Single-row orders behave exactly as before
- [ ] Typecheck and the full test suite pass
