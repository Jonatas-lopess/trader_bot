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

**Status:** done

- [x] The cancel action re-validates the session against the `sessions` table (not just the
      cookie) before doing anything — the one other place, besides logout, where ticket 02's
      hybrid design does a DB check. (`src/pages/conta/cancelar.ts` calls `isSessionValid`.)
- [x] The UI requires one click plus one confirmation step before calling the cancel
      action — not literally zero-friction (User Story 10). (Native `window.confirm()` in
      `src/pages/conta.astro`'s inline script; `src/content/conta.ts`'s `cancelConfirmMessage`.)
- [x] Calls Appmax's cancel-subscription API for the Cliente's `appmax_subscription_id`.
      (`appmax-client.ts`'s new `cancelSubscription`, endpoint shape unverified same as this
      file's other calls — spec.md's Further Notes.)
- [x] On success, applies the same rigidity-ranked compare-and-swap `UPDATE` against
      `subscriptions.status` that `checkout-webhooks` ticket 04 built for the webhook — a
      single atomic statement, no prior `SELECT` — so this write path and the webhook's
      share one state-transition rule (User Story 12). (`src/modules/billing/cancel.ts`.)
- [x] Cancellation is immediate: `subscriptions.status` flips to `canceled` right away;
      nothing here touches the `licenses` row or its `expires_at` — Licença and Assinatura
      stay independent lifecycles (User Story 11, CONTEXT.md).
- [x] The page reflects the new `canceled` status after a successful cancel. (`conta.astro`
      now also renders the Assinatura's own status via `getCustomerAccount`'s extended
      `status` column; the cancel form itself is hidden once already `canceled`.)
- [x] Tests, against the real D1 binding with Appmax's `fetch` mocked: a successful cancel
      flips status and leaves `licenses` untouched; a cancel racing a concurrently-delivered
      webhook event for the same subscription resolves deterministically via the CAS
      `UPDATE` with no lost update (mirrors `checkout-webhooks` ticket 04's own concurrency
      test, one new writer added). (`src/modules/billing/cancel.test.ts`, 4 tests.)
- [x] `npm test` and `npm run typecheck` pass.

## Comments

Extended `getCustomerAccount` (identity/customers.ts) and `AccountView`
(licensing/account-page.ts) to also carry the Assinatura's own `status` — ticket 03 only
needed Plano + Licença, but this ticket's "page reflects the new canceled status" criterion
needs the page to show the Assinatura's state too, not just the Licença's. Updated ticket
03's own `account-page.test.ts` assertions accordingly (additive field, not a behavior
change to anything ticket 03 tested).

Cancel's own CAS `UPDATE ... WHERE id = ? AND CASE status ... END <= 3` is unconditionally
true (3 is the max rigidity) — this is intentional, not a bug: cancellation is always
immediate per spec.md, so the CAS's role here is only to make the write atomic and share
webhook.ts's ranking, not to gate the transition. Worked through the race case explicitly in
`cancel.test.ts`'s last test and its comment: a concurrent webhook event re-confirming a
lower-rigidity status (e.g. stale `active`) can never undo a cancel, because the webhook's
own CAS checks the *current* stored rigidity before applying — if cancel's unconditional
write lands first, the webhook's `<= 1` check against an already-`canceled` (rigidity 3) row
fails closed, no lost update, no undo.
