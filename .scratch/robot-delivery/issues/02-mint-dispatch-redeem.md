# 02: Mint, dispatch, and redeem the download link

**What to build:** the full manual delivery path, ops-triggered end to end — ops runs one
command after a purchase, the Cliente gets an email, clicking the link streams the robot
binary. No auto-trigger off the webhook and no self-service resend in the customer area;
both were explicitly ruled out for 0.1 (same human-in-the-loop shape as license issuance,
PLANNING.md §8).

Governing docs: PLANNING.md §8 (delivery — never an attachment, signed/expiring link only),
§11 (download-link shape and TTL), CONTEXT.md (Robô — one program, not a family of them, so
one fixed binary/object, no per-plan variant); spec.md's "one outbound-fetch seam" testing
convention as already established by `modules/identity/resend-client.ts` (mock exactly the
Resend boundary, nothing else).

**Blocked by:** 01

- [ ] `pnpm run send-download-link -- --customer-id=<id>` (ops-run, no admin HTTP route):
      mints an opaque token, writes it to `download_tokens` with a 48h `expires_at`, and
      sends the delivery email via a Resend seam under `modules/licensing` (its own module
      boundary, mirroring — not reusing — `identity/resend-client.ts`'s pattern).
- [ ] `GET /download/:token`: token must exist and be unexpired; on success streams the
      object from the R2 binding and sets `used_at` (telemetry, does not gate future
      redemptions — the same token redeems repeatedly until it expires).
- [ ] Unknown token and expired token return the same plain error response — no content-file
      copy needed (this is a support-mediated dead end, not a user-facing flow to polish),
      and no signal distinguishing "never existed" from "expired".
- [ ] Streamed response is never HTML-attachment-shaped in a way that could get flagged —
      correct binary content type / `Content-Disposition`, no zip-wrapping requirement
      beyond what the fixture itself is.
- [ ] Tests: only the outbound Resend `fetch` is mocked (spec.md's testing convention); D1
      and R2 run against real test bindings. Cover mint→email→redeem happy path, redeeming
      the same token twice inside the TTL, and an expired token being rejected.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
