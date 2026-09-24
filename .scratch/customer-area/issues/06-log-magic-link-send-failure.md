# 06: Log magic-link send failures

**What to build:** `requestMagicLink` (`src/modules/identity/magic-link.ts`) discards
`sendMagicLinkEmail`'s result — if Resend returns non-`ok` (or is off/misconfigured), the
login token is still minted and stored in D1, but nothing observes the send failure. The
Cliente sees the same generic "email sent" confirmation either way (`/login?sent=1`, per
User Story 3), so this isn't a response-shape bug — it's a visibility gap: no log line, no
metric, nothing ops can use to notice Resend is down.

Governing docs: `.scratch/customer-area/issues/02-magic-link-login.md` (the generic-response
requirement this ticket must not change); PLANNING.md §12 (Resend test mode, a go-live gate).

**Blocked by:** 02 (this is a follow-up on its shipped code).

**Status:** done

- [x] `requestMagicLink` checks `sendMagicLinkEmail`'s `{ ok }` result and logs (e.g.
      `console.error`, matching the plain-log style `scripts/send-download-link.ts` and
      `webhook-hardening.ts` already use — no new logging dependency) on `ok: false`,
      including the customer id/email so ops can correlate against a support report.
- [x] The external behavior of `requestMagicLink`/`POST /login/request` is unchanged: still
      returns `void`, still always redirects to `/login?sent=1` regardless of match, throttle,
      or send outcome (User Story 3) — this ticket adds an internal log, not a new response
      branch.
- [x] Test: mock the outbound Resend `fetch` to return non-`ok`, call `requestMagicLink`, and
      assert the failure is logged (and that the token row is still written — unchanged
      behavior, not a regression check).
- [x] `npm test` and `npm run typecheck` pass.

## Comments

Implemented as part of ticket 07 (`.scratch/customer-area/issues/07-auto-send-magic-link-on-activation.md`):
the mint-and-send logic (including this log) was factored out of `requestMagicLink` into a
shared `issueMagicLink` (`identity/magic-link.ts`) so the webhook's new auto-send path gets
the same failure log for free — that path is where this log matters most, since it's now the
primary delivery path, not just the self-service fallback. Test added in
`magic-link.test.ts`: "logs visibly when Resend fails, but still mints the token and keeps
the generic response contract."
