# 07: Auto-send magic-link on first activation

**What to build:** the webhook auto-sends the magic-link login email the moment a
subscription first becomes `active` — the Cliente never has to type their email at `/login`
just to get in after paying. `/login`'s type-your-email flow stays exactly as-is, unchanged,
as the self-service fallback (resend, lost email, different device).

Context: the Cliente never types an email anywhere on our own checkout — `checkout.ts` only
ever collects `planId`; Appmax's hosted checkout page is what collects the email, which
reaches us via the webhook's authoritative status re-fetch (`identity-provisioning.md`,
`authoritative.email`). Requiring the same person to retype that same email at `/login`
right after paying was flagged as unnecessary friction — see grill discussion, this file's
own comments below for the alternative considered and rejected.

Governing docs: `.scratch/customer-area/issues/02-magic-link-login.md` (the login/session
machinery this reuses verbatim — no new session-creation path); `01-customer-identity-provisioning.md`
(the `onSubscriptionBecameActive` hook this hangs off); `06-log-magic-link-send-failure.md`
(the send-failure log this depends on being in place, since this ticket makes that log the
only ops signal for the primary — not just self-service — delivery path).

**Blocked by:** 01, 02, 06.

**Status:** done

- [x] `identity/customers.ts`'s `provisionCustomer` returns `{ id, created }` instead of
      `void` — `created` distinguishes an actual first-insert from the `ON CONFLICT`
      no-op, so a reapplied/renewal `active` event (webhook.ts's own documented case) can
      be told apart from first activation.
- [x] `identity/magic-link.ts`'s mint-and-send logic is factored out of `requestMagicLink`
      into an exported `issueMagicLink({ customerId, email, origin })` — the shared path
      both `requestMagicLink` (email lookup + throttle, then this) and the webhook
      (customer already known, no lookup/throttle) call, rather than a second
      implementation.
- [x] `billing/webhook.ts`'s `onSubscriptionBecameActive` calls `issueMagicLink` right
      after `provisionCustomer`, gated on `created: true` — a renewal/reapplied event must
      not re-issue a login email.
- [x] Origin: the webhook has no request to derive one from (server-to-server Appmax
      callback), unlike `pages/login/request.ts`'s `url.origin` — uses the same
      not-yet-registered placeholder domain (`APP_ORIGIN` constant in `webhook.ts`) the CLI
      script and both `resend-client.ts` files already use (PLANNING.md §12, go-live gate).
- [x] Tests: first activation mints exactly one `login_tokens` row and calls the Resend
      seam; a reapplied/renewal event after first activation does not mint a second one
      (`webhook.test.ts`).
- [x] `npm test` and `npm run typecheck` pass.

## Comments

Alternative considered and rejected: auto-redirecting the Cliente straight into `/conta`
from the confirmation page (`checkout/confirmacao.astro`) instead of sending an email,
using the checkout `ref` (the UUID `checkout.ts` mints and round-trips via `return_url`) as
an implicit session credential. Rejected — `ref` has none of the properties the actual login
token has (no TTL, not single-use, not HMAC-signed, appears in browser history/referrer
headers/D1 rows), and it would add a second session-creation code path alongside
`redeemMagicLink` (ticket 02), contradicting PLANNING.md §3's session design rather than
reusing it. It also only covers the same-tab case — closing the confirmation tab loses it
entirely, unlike an email, which works cross-device. If a same-tab shortcut is wanted later,
it should still consume the same `issueMagicLink`-minted token through `redeemMagicLink`,
not treat `ref` itself as a credential.

`confirmacao.astro`'s CTA stays exactly as ticket 05 left it (an inert `<span>`, "login
destination out of scope") — this ticket doesn't touch that page. The Cliente's path is:
confirmation page shows `active`, they check their email (now arriving automatically),
click the link.
