# 07: Verify the live-connected Corretora account against the bound one at check-in

**What to build:** extend the check-in (both the MQL5 client, ticket 04, and the verify
endpoint, ticket 02) so the robot reports the brokerage account it's actually trading
through, live, and the server rejects a mismatch against the account bound at checkout
(ticket 06).

This ticket's MQL5-side code has the same caveat as ticket 04: it doesn't live in this repo
(no MQL5 source tree here yet), so scope it as the spec for whichever repo/process produces
`robo-trader.ex5`, and land only the server-facing contract test here.

Governing docs: spec.md's §Corretora binding (`AccountInfoInteger(ACCOUNT_LOGIN)` as the
live, connection-sourced value — not the local config file — is what makes this resistant to
a config edit; forging it requires patching the compiled EA's own logic, same difficulty
tier as bypassing the rest of the check).

**Blocked by:** 02, 04, 06

- [ ] Extend the verify request to include the live account number, read via
      `AccountInfoInteger(ACCOUNT_LOGIN)` at the moment of check-in — never cached from a
      config file, never read once and reused across check-ins, so a Cliente switching
      accounts is caught on the very next hourly check-in.
- [ ] Server compares the reported account against the one bound to that `login` (ticket 06)
      and treats a mismatch as a hard failure — same generic failure shape as any other
      rejection (ticket 02's "no oracle" stance), not a distinguishable "wrong broker"
      signal an attacker could use to fingerprint which check failed.
- [ ] A license with no bound account yet (ticket 06's collection hasn't happened, or is
      deferred for this Cliente) does not hard-fail on this check — decide explicitly
      whether "unbound" means "skip this check" or "treat as unbound = fail," and record
      the choice here, since silently skipping would make the whole binding optional in
      practice.
- [ ] Tests: matching account passes, mismatched account fails, an unbound license behaves
      per whatever this ticket decides above, and switching the connected account between
      two check-ins is caught on the first check-in after the switch (not delayed).
- [ ] `pnpm test` and `pnpm run typecheck` pass for the fixture/contract test added here.
