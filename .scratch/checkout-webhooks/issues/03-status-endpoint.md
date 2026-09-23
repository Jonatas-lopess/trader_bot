# 03: Status endpoint

**What to build:** a small read-only endpoint that the (not-yet-built) intermediate
confirmation page can poll to find out, by checkout-attempt reference, whether payment is
still pending, confirmed, or a Boleto specifically still awaiting up to a business day.

Governing docs: spec.md's "Status endpoint" (Implementation Decisions), User Stories 3-5.

**Blocked by:** 01, 02 (needs the `plans` table and the reference scheme ticket 02
settles for identifying a checkout attempt).

**Status:** ready-for-agent

- [ ] Endpoint accepts the checkout attempt's reference and returns one of: `pending`,
      `active`, or a Boleto-specific "awaiting up to one business day" state — distinct
      from generic `pending` so the confirmation page can show the right copy (User Story
      4).
- [ ] A reference with no matching row returns a clear not-found/invalid response, not a
      crash.
- [ ] No WebSocket, no Durable Object — plain polling target per §7 ("~2s interval, no
      WebSocket, no Durable Object needed at this scale").
- [ ] Test seeds rows directly in the real D1 binding (ticket 01's pattern) and asserts on
      the endpoint's HTTP response for each status, not on internal function calls, per
      spec.md's Testing Decisions.
- [ ] `npm test` and `npm run typecheck` pass.
