# 02: Provision per-license secret/payload and deliver alongside the binary

**What to build:** the ops-run path that mints a license's secret and initial payload, and
extends `robot-delivery`'s download flow to hand the robot its per-license config alongside
the (unchanged, one-program) `.ex5`.

Governing docs: spec.md's Implementation Decisions ("delivery mechanism ... reuses
`robot-delivery`'s signed-link pattern"), CONTEXT.md ("one program, not a family of them" —
the `.ex5` itself stays a single object; only the config/license file is per-customer),
`scripts/provision-customer.ts` / `scripts/send-download-link.ts` as the existing
human-in-the-loop scripting pattern to mirror.

**Blocked by:** 01

- [ ] `pnpm run provision-license -- --subscription-id=<id>` (ops-run, no admin HTTP route,
      same shape as `send-download-link`): generates a fresh per-license secret, writes it
      and an initial `payload` to the row/table from ticket 01, and (re)sets `validade` from
      the existing `licenses.expires_at` issuance step — does not duplicate that issuance
      step, only adds secret/payload alongside it.
- [ ] Extend the download-token redemption (`robot-delivery` ticket 02, `GET
      /download/:token`) or add a sibling route so the Cliente receives, alongside the
      `.ex5`, a small per-license config/license file containing the secret and `login`
      needed for check-in — decide packaging (a second file in the same email, or a
      zip/archive containing both) as part of this ticket, consistent with PLANNING §8's
      "never as a bare attachment" rule for the executable specifically (the config file
      itself is not executable and isn't subject to that constraint).
- [ ] The secret is never logged and never stored anywhere in cleartext outside the D1 row
      it's provisioned into and the one-time delivery artifact.
- [ ] Tests: provisioning script is idempotent-safe to re-run (re-provisioning rotates the
      secret deliberately, documented as the revoke-and-reissue path — a compromised license
      is revoked by rotating its secret, not by deleting the row), and the delivery route
      serves a config file whose contents round-trip against what ticket 01's verify
      endpoint expects.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
