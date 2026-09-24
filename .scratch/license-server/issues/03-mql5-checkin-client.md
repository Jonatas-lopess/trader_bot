# 03: MQL5 check-in client — verify, fail-closed with tolerance, never touch open positions

**What to build:** the robot-side half — init and hourly check-in, HMAC verification using
MQL5's native `CryptEncode(CRYPT_HASH_SHA256, ...)`, and the fail-closed/tolerance/
positions-never-abandoned behavior.

This ticket's code does not live in this repo (no MQL5 source tree exists here yet — the
Robô binary is opaque, delivered as `robo-trader.ex5`); scope it as the spec for whichever
repo/build process actually produces that `.ex5`, and land only the server-facing contract
test (a fixture client hitting the real verify endpoint) here.

Governing docs: ADR-0004 (no native RSA/Ed25519 in MQL5 — HMAC-SHA256 via `CryptEncode`
only), spec.md (nonce/replay defense, tolerance window, positions never abandoned).

**Blocked by:** 01

- [ ] HMAC-SHA256 implemented in MQL5 on top of `CryptEncode(CRYPT_HASH_SHA256, ...)` (no
      DLL — Market distribution constraint) — keyed construction per ADR-0004, embedded
      secret read from the per-license config file (ticket 02), never hardcoded in the
      compiled source.
- [ ] Check-in on `OnInit` and on a 1-hour timer: generate a fresh random `nonce`, call the
      verify endpoint, recompute the HMAC over the response and compare to `signature`.
- [ ] Accept only if: signature matches, `nonce` in the response equals the one just sent,
      `login` equals this copy's own, `validade` is in the future. Any other outcome —
      including no response / network failure — is a failed check-in.
- [ ] On a failed check-in: block new order entries (`OrderSend` for opens) starting
      immediately for a hard failure (bad signature, wrong login, expired validade), or
      after a 24h grace period since the *last successful* check-in for
      unreachable-server failures specifically (tolerance window, spec.md) — never touch
      positions already open, regardless of which failure mode or how long it's been
      failing.
- [ ] Successful payload is applied (whatever operative parameters it carries) only after
      the checks above pass — never applied provisionally ahead of verification.
- [ ] Test (against the real ticket-01 endpoint, no MQL5 test runner available): a fixture
      script that mimics the MQL5 client's protocol — valid check-in, tampered signature,
      replayed nonce, expired validade — each produces the expected accept/reject, so the
      contract the MQL5 side depends on is pinned even without an MQL5-level test harness.
- [ ] `pnpm test` and `pnpm run typecheck` pass for the fixture/contract test added here.
