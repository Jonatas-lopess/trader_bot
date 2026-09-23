# 07: End-to-end verification — happy path, boleto branch, concurrency

**What to build:** the remaining test matrix from spec.md's Testing Decisions, run against
the full assembled stack, so the effort closes out with proof the pieces work together,
not just individually.

Governing docs: spec.md's Testing Decisions ("Covered: ... the checkout-session →
provisional-record → webhook-confirms-active happy path, and the Boleto branch's status
endpoint response before confirmation arrives", "concurrent delivery of two events for the
same subscription").

**Blocked by:** 04, 05, 06 (needs checkout, webhook core, hardening, and the confirmation
page all in place to exercise the full loop).

**Status:** done

- [ ] Test: the full happy path — `/checkout?plan=<id>` creates a provisional row, a
      simulated Appmax webhook event confirms it, the status endpoint (and by extension the
      confirmation page) reflects `active`.
- [ ] Test: the Boleto branch — checkout creates a provisional row, the status endpoint
      returns the Boleto-specific awaiting state before any webhook arrives, then a
      simulated webhook flips it to `active`.
- [ ] Test: concurrent delivery of two events for the same subscription resolves
      deterministically via the compare-and-swap `UPDATE` (ticket 04) with no lost update
      and no interleaved read/write.
- [ ] Manual/local run: exercise `/planos` → checkout → confirmation page against a local
      Appmax sandbox (or the ticket's mocked equivalent) end to end at least once, per the
      repo's general "test the golden path in a browser" practice.
- [ ] `npm test` and `npm run typecheck` pass.

## Comments

Writing the boleto-branch e2e test surfaced a real bug in ticket 04's webhook core: its CAS
`UPDATE` had a `status != ?` guard (added to make "first transition to active" detection
clean) that also blocked updating `payment_method` whenever the authoritative status didn't
change — which is exactly the boleto case (Appmax's "order created" event reports still
`pending`, but now with a known payment method). Removed the guard in
`src/modules/billing/webhook.ts`; the rigidity check (`<=`) alone already makes a same-status
reapplication safe. `onSubscriptionBecameActive`'s doc comment updated to match — it can now
fire on a reapplied `active`, same as it always could for genuine renewal-type events.

The "lets a legitimate request pass through" test in ticket 06's file was intermittently
timing out at the default 5s (`WEBHOOK_RATE_LIMITER`'s Durable Object cold start plus a real
D1 write plus a mocked fetch round trip). Bumped `testTimeout` to 15s in `vitest.config.ts`
for the whole suite rather than special-casing one test; confirmed clean across several
repeated full-suite runs afterward.

Manual run: `wrangler dev` + local D1, with an `Origin` header set to satisfy Astro's own
CSRF check (missing it is a flat 403, unrelated to this feature). Confirmed `/planos`' three
CTAs link to `/checkout?plan=<id>`; `/checkout?plan=bogus` returns 400; `/checkout?plan=starter`
reaches the real Appmax sandbox auth endpoint with placeholder credentials and fails there,
returning 502 exactly as `checkout.ts` maps it — proving the real HTTP routing/env plumbing
end to end, not just the mocked unit tests, though the full Appmax-success path itself can't
be manually verified without real sandbox credentials (PLANNING.md §12/§13). Also re-confirmed
`/checkout/confirmacao` and `/billing/status` against a seeded row through the same real
routing layer.
