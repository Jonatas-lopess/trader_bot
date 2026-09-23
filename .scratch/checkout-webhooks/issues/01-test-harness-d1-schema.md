# 01: Test harness + D1 schema for billing

**What to build:** the infrastructure the rest of `checkout-webhooks` runs on — a real D1
binding and a real Workers test runtime, plus the two tables the checkout/webhook flow
reads and writes. Nothing user-facing ships in this ticket; it's the prefactor that makes
every later ticket's "test against real D1 semantics" testing decision possible.

Governing docs: spec.md's Testing Decisions ("runs against the real Workers runtime and a
real D1 binding via `@cloudflare/vitest-pool-workers`") and Implementation Decisions
("Provisional record", "D1 concurrency — compare-and-swap, not read-then-write").

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `@cloudflare/vitest-pool-workers` added as a dependency; `vitest.config.ts` switched
      to the Workers pool (today's config is plain Vitest — see its own comment on why).
- [ ] A D1 binding added to `wrangler.jsonc` (no D1 binding exists there today).
- [ ] Migration creates a `plans` table (or equivalently named provisional/subscription
      table) with at least: an id/reference, `plan_id`, and `status` (`pending | active |
      past_due | canceled`) per spec.md's "Provisional record" — no Cliente identity
      columns, per §7 ("the account is provisioned from payment, not before it").
- [ ] Migration creates a `processed_webhooks` table keyed by the composite idempotency id
      (`order_id + event`, or `subscription_id + order_id + event` for subscription
      events) with that composite as `PRIMARY KEY`.
- [ ] A test in `src/modules/billing` (replacing its `.gitkeep`) proves a query round-trips
      against the real D1 binding under `@cloudflare/vitest-pool-workers` — this is the
      pattern ticket 02 onward build on, per spec.md ("this ticket sets the pattern the
      other two follow").
- [ ] `npm test` and `npm run typecheck` pass.
