# 03: End-to-end verification — mint to download

**What to build:** the same closing role `checkout-webhooks` ticket 07 and `customer-area`
ticket 05 played for their efforts — one suite exercising the real path with only the
outbound Resend `fetch` mocked, catching integration gaps ticket 02's own unit-level tests
might miss.

Governing docs: same as ticket 02.

**Blocked by:** 02

- [ ] Happy path: run the mint command for a fixture customer, capture the link from the
      mocked Resend call, `GET` it, and assert the streamed bytes match the fixture object
      byte-for-byte.
- [ ] Reuse: the same link redeemed a second time before expiry succeeds again (confirms the
      grill's "reusable within TTL, not single-use" decision actually holds end to end, not
      just at the unit level).
- [ ] Expiry: a token past its `expires_at` is rejected by `GET /download/:token`.
- [ ] Unknown token: a token never minted gets the identical error response as the expired
      case — no distinguishing signal.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
