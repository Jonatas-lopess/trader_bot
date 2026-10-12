# 16: E-mail dead letter and admin resend

**What to build:** A shared helper that sends an e-mail through the Resend seam and, if the send fails, parks it in a dead-letter table instead of losing it (ADR-0008).

- Migration: `email_dead_letters` (id, `kind` e.g. `encomenda`, `to_address`, `reply_to`, `subject`, `body`, `attempts`, `last_error`, `created_at`, `last_attempt_at`, `resolved_at`). `last_error` stores Resend's rejection reason (customer-area 06 and sentry-integration 08 already surface it) and never a secret or an API key.
- `modules/…/send-with-dead-letter.ts` (place beside the Resend client): `sendOrParkEmail(env, message, {kind})` returns a discriminated union `{ok:true}` | `{ok:false, parked:true}`; a failing park (D1 down) is logged to Sentry and does not throw into the caller. A successful send inserts nothing.
- `resendDeadLetter(env, id)`: re-sends the stored message; success sets `resolved_at`, failure increments `attempts` and updates `last_error`. Idempotent against a double click (resolve is a conditional UPDATE).
- Admin page `/admin/emails` (04's gate and Origin check): unresolved items first (kind, recipient, age, attempts, last error, "reenviar" button), resolved ones below, no body editing. A count of unresolved items is visible on `/admin`.
- **Not stored here:** any e-mail whose body carries a secret (magic link, download link). The helper takes a `storeBody: false` option that parks only metadata and makes resend impossible; adoption by those sends is a separate decision (ADR-0008 Open).
- No cron retry; note the Workers cron trigger as the follow-up.

**Blocked by:** 04.

**Status:** done

TDD seam: `sendOrParkEmail` and `resendDeadLetter` with Resend `fetch` mocked and D1 real: success inserts nothing, failure parks with the reason, resend success resolves, resend failure bumps attempts, double resend sends once, park failure does not throw.

- [x] A failed send is parked with recipient, subject, body and the Resend reason
- [x] Admin sees it, resends it, and a success removes it from the unresolved list
- [x] Non-admin gets 404 on `/admin/emails`; cross-origin resend POST gets 403
- [x] Typecheck and the full test suite pass

## Comments

Decisions (implementation: `src/modules/identity/send-with-dead-letter.ts`, `migrations/0014_email_dead_letters.sql`, `src/pages/admin/emails.astro`, `src/pages/admin/emails/resend.ts`).

- **Helper API (for ticket 14).** `sendOrParkEmail(env, { to, replyTo?, subject, body }, { kind, storeBody? })` returns `{ ok: true }`, `{ ok: false, parked: true }` or `{ ok: false, parked: false }` (the send failed and so did the park; reported to Sentry without the body). It never throws. Messages are plain text: the body goes to Resend as `text` only, so requester text is never markup, and `to` / `reply_to` are separate JSON fields, never spliced into a header. A fetch that throws (network down) counts as a failed send and is parked with `network error: ...`. Usage is in the file header.
- **Where it lives; the two Resend clients are not consolidated.** The helper sits beside `modules/identity/resend-client.ts`, which gained a generic `sendEmail` (plain text, reply-to) sharing a private `postToResend` with `sendMagicLinkEmail`. `modules/licensing/resend-client.ts` stays separate: it is deliberately "mirroring, not reusing" (robot-delivery 02), has a different from-address and template, and merging the two is not a trivial change. The new sender uses the identity from-address (`onboarding@resend.dev` until the domain verifies; PLANNING §12).
- **Double click.** `resendDeadLetter` first claims the row with one conditional `UPDATE ... RETURNING` (unresolved, has a body, last attempt older than 10 s; it also counts the attempt), so two racing clicks send once and the loser gets `busy` or `already-resolved`. Success then sets `resolved_at` with a conditional UPDATE; failure stores Resend's reason. Side effect: a resend within 10 s of the previous attempt (including the park) answers `busy`. Other results: `not-found`, `no-body`, `send-failed` (with `detail`).
- **`attempts`** counts every attempt including the first, failed send (a fresh park has `attempts = 1`). `last_attempt_at` is the lease. `body` is nullable (NULL for `storeBody: false`); such rows list without a resend button.
- **Admin.** `/admin/emails` (GET) lists unresolved rows oldest first, then the last 50 resolved; the bodies are never selected. The resend is `POST /admin/emails/resend` (form field `id`): non-admin 404, admin with a bad `Origin` 403 (`requireAdmin` before `assertSameOrigin`, per ticket 04), then 303 back to the list with `?resent=<outcome>` for a flash line. `/admin` shows the unresolved count (red when above zero) linking to the list; the list is also an `adminSections` entry. Copy is in `src/content/admin.ts`.
- **No cron retry.** Follow-up: a Workers cron trigger scanning unresolved rows and calling `resendDeadLetter`. Adoption by magic-link and download-link e-mails (with `storeBody: false`) is a separate decision (ADR-0008 Open).
