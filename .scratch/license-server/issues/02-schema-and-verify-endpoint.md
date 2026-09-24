# 02: Per-license secret/payload schema + verify endpoint

**What to build:** the server side of the check-in — a D1 migration extending licensing
with a per-license HMAC secret and payload, plus the `login + nonce` verify endpoint that
signs its response.

Governing docs: spec.md (this effort), ADR-0004 (HMAC-SHA256, per-license secret, not
RSA/Ed25519), PLANNING.md §8 (fail-closed with tolerance, positions never abandoned — the
robot-side half, but the server response must carry everything the robot needs to enforce
it: `validade` truthfully, no partial/ambiguous states).

**Blocked by:** 01

- [ ] Migration `0007_license_secrets.sql`: add `secret` (per-license HMAC key, generated
      server-side, never sent back in cleartext except at initial provisioning) and
      `payload` (opaque blob) columns to `licenses`, or a new 1:1 table if keeping `licenses`
      free of these columns reads better against migrations/0005's existing comments —
      either way, `subscription_id` remains the join key, not a new identifier.
- [ ] `POST /license/verify` (or equivalent path — no customer session, no cookie; this is
      called by the robot directly): body is `{login, nonce}`. Look up the license by
      `login` (= `subscription_id`); if missing, return a generic failure (same
      indistinguishable-failure shape `robot-delivery`'s download endpoint uses for
      unknown/expired tokens — no oracle for "which logins exist").
- [ ] On a found, non-revoked license: compute
      `HMAC-SHA256(secret, login || nonce || validade || payload)` and return
      `{login, nonce, validade, payload, signature}`. `validade` is that license's
      `expires_at`; a `NULL` (license never issued/prepared) is a failure response, not a
      response with a null field — the robot's contract only understands pass/fail.
- [ ] Rate-limit or otherwise bound this endpoint (it takes no auth) — reuse
      `webhook-hardening.ts`'s existing rate-limit pattern rather than inventing a new one.
- [ ] Tests: unknown `login`, revoked/expired license, valid license returns a
      correctly-computed signature (verify by recomputing the HMAC in the test, not by
      trusting the endpoint's own math), and two calls with two different `nonce` values
      produce two different signatures (rules out a signature that ignores nonce).
- [ ] `pnpm test` and `pnpm run typecheck` pass.
