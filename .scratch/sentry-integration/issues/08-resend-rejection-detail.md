# 08: Surface Resend's rejection reason in the send-failure logs

**What to build:** both Resend seams (`modules/identity/resend-client.ts`'s
`sendMagicLinkEmail`, `modules/licensing/resend-client.ts`'s `sendDownloadLinkEmail`)
discard Resend's response body today — callers only ever see `{ ok: false }`. A staff
member reading `issueMagicLink`'s Sentry event (ticket 02) or the download-link ops CLI's
console output currently can't tell "this recipient address was rejected" apart from "the
Resend API key/account is broken" — both look identical. Parse Resend's JSON error body
(`name`/`message`, per its API) when `!response.ok` and thread it through:

- `sendMagicLinkEmail` / `sendDownloadLinkEmail` return the detail alongside `ok`, not just
  a boolean.
- `issueMagicLink` (`identity/magic-link.ts`) includes it in the existing `console.error`
  and `Sentry.captureMessage` extra context — additive to both, same double-write pattern
  as ticket 02.
- `dispatch.ts`'s `sendDownloadLinkEmail` caller includes it in its own `reason:
  'email_failed'` result so `scripts/send-download-link.ts`'s ops CLI prints the real
  reason instead of a bare `email_failed`. This path stays outside Sentry, unchanged from
  ticket 05's "script is console-visible, no Workers-log gap to close" finding — this is
  richer CLI output, not a Sentry capture.

Governing docs: `02-report-caught-failures.md` (the capture site this extends),
`05-audit-remaining-friction-points.md` (why the download-link path stays Sentry-free).

**Blocked by:** None (can start immediately)

**Category:** enhancement

**Status:** ready-for-agent

- [ ] `SendMagicLinkEmailResult` and `SendDownloadLinkEmailResult` gain a `detail` field
      (or equivalent), populated from Resend's parsed JSON error body on `!response.ok`;
      parse defensively — tolerate a non-JSON or empty body rather than throwing.
- [ ] `issueMagicLink`'s existing `console.error` and `Sentry.captureMessage` extra context
      both include the new detail, additive — no change to either call's existing fields.
- [ ] `dispatch.ts`'s `email_failed` result carries the same detail through to
      `scripts/send-download-link.ts`'s printed output.
- [ ] `magic-link.test.ts`'s "logs visibly when Resend fails" case (and any equivalent
      download-link test) mocks a realistic non-ok JSON error body (not a bare
      `Response(null, ...)`) and asserts the detail reaches the log, the Sentry capture's
      extra, and (for the download-link path) the CLI-facing result.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
