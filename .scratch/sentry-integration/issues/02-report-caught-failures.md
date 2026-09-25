# 02: Report the 3 known caught-and-handled failures

**What to build:** the three failure branches this repo already detects but only logs to
Workers' own console today become visible in Sentry, with enough context (order_id,
subscription_id, customer_id, email — whichever the site has) that a staff member can
identify the affected Cliente/Assinatura from the Sentry event alone, no Workers-log access
needed:

1. `src/modules/billing/webhook.ts` — `onSubscriptionBecameActive`: no `email` field on
   Appmax's authoritative re-fetch, `customers` row not created (the exact case
   `scripts/provision-customer.ts` exists to recover from manually).
2. `src/modules/billing/webhook.ts` (or `stripe-webhook.ts`, wherever the equivalent lives) —
   no subscription row matches the webhook's order/subscription id.
3. `src/modules/identity/magic-link.ts` — `issueMagicLink`: Resend send failed.

This is necessary work on top of ticket 01, not redundant with it: all three sites already
catch their own failure and return/no-op normally rather than rethrow, so ticket 01's outer
`Sentry.withSentry` wrapper never sees them — confirmed by `projeto_ebd`'s own
`/billing/webhook` route, whose caught-and-converted-to-500 error is likewise invisible to
its outer wrapper and never reaches Sentry. Each site needs its own explicit
`Sentry.captureException` (or `captureMessage` where there's no `Error` object, just a
console template string) call.

**Blocked by:** 01 (needs the SDK wired in before anything can call `captureException`)

**Status:** done

- [ ] All 3 sites call `Sentry.captureException`/`captureMessage` with structured context
      (order_id/subscription_id/customer_id/email as available)
- [ ] Existing `console.error` calls at all 3 sites are kept as-is, Sentry capture is
      additive — same double-write pattern as `projeto_ebd`'s
      `console.error("[api] caught error, logged to Sentry"); Sentry.captureException(error)`
- [ ] Existing unit tests for `webhook.ts` and `magic-link.ts` extended to assert the
      capture call fires under each of the 3 triggering conditions (mock `Sentry.captureException`)
- [ ] `pnpm test` and `pnpm run typecheck` pass

## Comments

**Site 2 had no existing `console.error` to be additive to** — unlike sites 1 and 3, a CAS
update landing zero changes was previously silent either way (stale/out-of-order event and
genuinely-unmatched ref were indistinguishable, and neither logged). Added a
`console.error` alongside the new `Sentry.captureMessage` call there too, matching the other
two sites' double-write pattern, rather than leaving it Sentry-only.

**Site 2 placed in `webhook.ts` (Appmax) only, not `stripe-webhook.ts`** — Appmax is the
committed production gateway (ADR-0003); Stripe is a test-only stopgap (docs/adr/0005) that
never runs in production. The ticket's "wherever the equivalent lives" read as picking one
canonical site, not duplicating into the test-only driver too.

**Site 2 needed a way to tell "no matching row" apart from "row exists, rigidity blocked it"**
(an expected out-of-order/stale delivery, not an error) — `result.meta.changes === 0` alone
can't distinguish them. Resolved with a second lookup via
`findSubscriptionIdByProviderRef` (already shared with `onSubscriptionBecameActive`): only
capture when that also comes back `null`. Covered by two new test assertions — the existing
"no matching row" test now asserts the capture fires, and the existing "out-of-order
delivery" test now asserts it does not.
