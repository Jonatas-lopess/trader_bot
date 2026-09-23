# 04: Cancel subscription

**What to build:** one-click-plus-confirm cancellation from the customer area, calling
Appmax's cancel API and applying the same compare-and-swap `UPDATE` the webhook uses, so a
customer-initiated cancel can never race a concurrent webhook delivery for the same
subscription.

Governing docs: spec.md's "Solution" and "Implementation Decisions" (cancellation is
immediate, CAS reuse, hybrid session's DB check on this sensitive action); PLANNING.md §6
("Checkout and webhook implementation" — CAS `UPDATE` pattern), §11 (scheduled cancellation
deferred). User Stories 10, 11, 12.

**Blocked by:** 03 (the action lives on the license-status page), 01 (needs the
`subscriptions` row to cancel).

**Status:** ready-for-agent

- [ ] The cancel action re-validates the session against the `sessions` table (not just the
      cookie) before doing anything — the one other place, besides logout, where ticket 02's
      hybrid design does a DB check.
- [ ] The UI requires one click plus one confirmation step before calling the cancel
      action — not literally zero-friction (User Story 10).
- [ ] Calls Appmax's cancel-subscription API for the Cliente's `appmax_subscription_id`.
- [ ] On success, applies the same rigidity-ranked compare-and-swap `UPDATE` against
      `subscriptions.status` that `checkout-webhooks` ticket 04 built for the webhook — a
      single atomic statement, no prior `SELECT` — so this write path and the webhook's
      share one state-transition rule (User Story 12).
- [ ] Cancellation is immediate: `subscriptions.status` flips to `canceled` right away;
      nothing here touches the `licenses` row or its `expires_at` — Licença and Assinatura
      stay independent lifecycles (User Story 11, CONTEXT.md).
- [ ] The page reflects the new `canceled` status after a successful cancel.
- [ ] Tests, against the real D1 binding with Appmax's `fetch` mocked: a successful cancel
      flips status and leaves `licenses` untouched; a cancel racing a concurrently-delivered
      webhook event for the same subscription resolves deterministically via the CAS
      `UPDATE` with no lost update (mirrors `checkout-webhooks` ticket 04's own concurrency
      test, one new writer added).
- [ ] `npm test` and `npm run typecheck` pass.
