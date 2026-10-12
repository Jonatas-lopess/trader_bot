# 16: E-mail dead letter and admin resend

**What to build:** A shared helper that sends an e-mail through the Resend seam and, if the send fails, parks it in a dead-letter table instead of losing it (ADR-0008).

- Migration: `email_dead_letters` (id, `kind` e.g. `encomenda`, `to_address`, `reply_to`, `subject`, `body`, `attempts`, `last_error`, `created_at`, `last_attempt_at`, `resolved_at`). `last_error` stores Resend's rejection reason (customer-area 06 and sentry-integration 08 already surface it) and never a secret or an API key.
- `modules/…/send-with-dead-letter.ts` (place beside the Resend client): `sendOrParkEmail(env, message, {kind})` returns a discriminated union `{ok:true}` | `{ok:false, parked:true}`; a failing park (D1 down) is logged to Sentry and does not throw into the caller. A successful send inserts nothing.
- `resendDeadLetter(env, id)`: re-sends the stored message; success sets `resolved_at`, failure increments `attempts` and updates `last_error`. Idempotent against a double click (resolve is a conditional UPDATE).
- Admin page `/admin/emails` (04's gate and Origin check): unresolved items first (kind, recipient, age, attempts, last error, "reenviar" button), resolved ones below, no body editing. A count of unresolved items is visible on `/admin`.
- **Not stored here:** any e-mail whose body carries a secret (magic link, download link). The helper takes a `storeBody: false` option that parks only metadata and makes resend impossible; adoption by those sends is a separate decision (ADR-0008 Open).
- No cron retry; note the Workers cron trigger as the follow-up.

**Blocked by:** 04.

**Status:** ready-for-agent

TDD seam: `sendOrParkEmail` and `resendDeadLetter` with Resend `fetch` mocked and D1 real: success inserts nothing, failure parks with the reason, resend success resolves, resend failure bumps attempts, double resend sends once, park failure does not throw.

- [ ] A failed send is parked with recipient, subject, body and the Resend reason
- [ ] Admin sees it, resends it, and a success removes it from the unresolved list
- [ ] Non-admin gets 404 on `/admin/emails`; cross-origin resend POST gets 403
- [ ] Typecheck and the full test suite pass
