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

**Status:** ready-for-agent

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
