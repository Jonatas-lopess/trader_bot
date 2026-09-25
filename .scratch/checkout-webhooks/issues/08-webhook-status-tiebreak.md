# 08: No event-ordering tiebreak in the webhook status CAS

**What to build:** decide whether the rigidity-ranked compare-and-swap in
`src/modules/billing/subscription-lookup.ts` (shared by `webhook.ts` and
`stripe-webhook.ts`) needs a tiebreak for two same-rigidity events delivered out of
order, and build it if so.

Governing docs: spec.md's "D1 concurrency — compare-and-swap, not read-then-write";
04-webhook-core.md.

**Blocked by:** none — informational finding, not yet scoped.

**Status:** wontfix

## Problem

The CAS only ranks by status rigidity (`pending < active < past_due < canceled`,
`STATUS_RIGIDITY`), never by *when* the event happened. Two events that resolve to the
same status (e.g. two `past_due` deliveries from separate dunning attempts, or a
replayed vs. a fresh `active`) can apply in either arrival order — whichever's `UPDATE`
lands last wins, even if it's the stale one. The rigidity check's `<=` (not `<`) exists
precisely so a same-status re-apply doesn't get rejected (see webhook.ts's own comment
on that), which is also what makes this ordering gap possible.

Surfaced by a cross-repo comparison against `~/projeto_ebd`'s own payment-provider seam
(`packages/api/src/routers/billing/billing.service.ts`), whose Postgres RPC
(`process_subscription_webhook`) breaks same-rigidity ties on the gateway event's own
`created` timestamp, re-fetching live status from Stripe on an exact tie. D1 has no
stored procedures, so that exact approach doesn't port as-is.

## Open questions

- Does this ever actually happen given Appmax/Stripe's real delivery ordering
  guarantees (or lack thereof, ADR-0003), or is it a theoretical gap not worth building
  around?
- If it needs fixing: bind on a client-supplied event timestamp (Stripe's `created`
  field exists; Appmax's payload shape doesn't document one — unverified contract,
  appmax-client.ts's header) in the CAS `WHERE`, or re-fetch-and-compare in application
  code before the `UPDATE` (loses the single-statement-no-race property the current CAS
  is built around).
- Scope: this affects both `webhook.ts` (Appmax) and `stripe-webhook.ts` (Stripe) since
  both now share `subscription-lookup.ts`'s `STATUS_RIGIDITY`/CAS SQL.

## Answer

Both handlers re-fetch *authoritative* status live from the gateway at processing time
(`fetchAuthoritativeStatus`, spec.md's trust model) — the payload's own status is never
trusted. So the race isn't "stale payload beats fresh payload": it's that two concurrent
deliveries each independently query the gateway, each getting whatever's true at that
instant, then race to `UPDATE` in D1. The CAS only gates on rigidity bucket, not on when
each fetch happened, so whichever `UPDATE` lands last in D1 wins even if its own fetch
was chronologically earlier.

Actual exposure, traced through `webhook.ts`/`stripe-webhook.ts`/`appmax-client.ts`/
`stripe-client.ts`:

- `status` itself can't regress to something *wrong* — same-rigidity means both fetches
  returned the same bucket from the live gateway, so a "stale write wins" only reverts to
  an older-but-still-valid value in that bucket, not a fabricated one.
- The one field actually at risk is `payment_method` (`COALESCE(?, payment_method)`),
  Appmax-only — Stripe's driver returns `paymentMethod: 'card'` unconditionally once a
  subscription exists, so `stripe-webhook.ts` isn't exposed. Worst case: a boleto/pix
  method transiently reverts to `null`/an older value.
- Self-healing: the next real delivery re-fetches truth and re-applies, so any wrong
  `payment_method` doesn't persist past one more webhook.
- No fix is buildable without a worse trade-off: neither gateway's authoritative
  response carries a timestamp/sequence field to bind a real tiebreak on
  (`FetchAuthoritativeStatusResult` in both appmax-client.ts and stripe-client.ts —
  `status`/`paymentMethod`/`email` only). A tiebreak would have to either trust a
  payload-supplied timestamp (breaks the "authoritative fetch, not payload" trust model
  this whole design is built on) or depend on an Appmax response field that's unverified
  to even exist (appmax-client.ts's own "UNVERIFIED CONTRACT" header).

Not worth building: real but narrow (one field, one gateway, self-correcting), and the
only implementable fixes cost more architecturally than the bug is worth. Closing as
`wontfix` rather than leaving it open against a fix that isn't buildable on what
`fetchAuthoritativeStatus` actually returns.

## Comments

Logged during code review of `docs/adr/0005-stripe-test-driver.md`'s Stripe test
driver — not a regression introduced by that branch, pre-existing in `webhook.ts` since
04-webhook-core.md and only confirmed to still apply after `stripe-webhook.ts` was added
alongside it.
