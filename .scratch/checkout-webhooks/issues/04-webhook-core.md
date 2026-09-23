# 04: Webhook core — idempotent, compare-and-swap state sync

**What to build:** the `/billing/webhook` endpoint that keeps an Assinatura's D1 status in
sync with Appmax, trusting nothing from the payload except which record to check, and
never double-applying or reordering an event.

Governing docs: spec.md's "Webhook trust model" and "D1 concurrency — compare-and-swap,
not read-then-write" (Implementation Decisions); PLANNING.md §6 "Checkout and webhook
implementation"; ADR-0003. User Stories 6-10, 13.

**Blocked by:** 01, 02 (needs the `plans` and `processed_webhooks` tables, and the
provisional-record reference scheme from checkout-session creation to have something to
update).

**Status:** ready-for-agent

- [ ] `/billing/webhook` responds `200` without waiting on anything beyond what
      correctness requires; no queue/background job introduced (spec.md: Workers' CPU-time
      budget excludes I/O wait — safe for 0.1).
- [ ] The raw payload (full JSON) is stored before any processing, independent of the
      idempotency check, for debugging and manual replay (User Story 7).
- [ ] Idempotency is a single `INSERT` into `processed_webhooks` keyed by the composite id
      (`order_id + event`, or `subscription_id + order_id + event` for subscription
      events); a uniqueness violation on that insert *is* the "already processed" result —
      no prior `SELECT` (User Story 6).
- [ ] Every delivery triggers exactly one Appmax API call to fetch the referenced
      order/subscription's current authoritative status; the payload's own status field is
      never used to decide state (User Story 10).
- [ ] The state transition is a single compare-and-swap `UPDATE` whose `WHERE` clause
      ranks current vs. new status rigidity inline (`CASE`-based), so a less-current event
      can never overwrite a more-current state; whether it applied is read off the
      statement's affected-row count, not a follow-up `SELECT` (User Story 8).
- [ ] A subscription/order the webhook references with no matching D1 row is ignored — not
      an error, not a new row (User Story 9).
- [ ] The point where an Assinatura first transitions to `active` is a clearly identifiable
      single spot in the code (not an event bus), documented as the future magic-link/
      customer-area hook per spec.md's "Module boundary" (User Story 13).
- [ ] Everything lives under `modules/billing`; no `IPaymentProvider` abstraction is
      introduced (spec.md: "No payment-provider interface").
- [ ] Tests cover, against the real D1 binding with only Appmax's `fetch` mocked:
      idempotent replay of the same event, out-of-order delivery (less-current event after
      a more-current one), and an unknown subscription/order reference being ignored.
- [ ] `npm test` and `npm run typecheck` pass.
