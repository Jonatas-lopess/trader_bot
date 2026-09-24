# customer-area

Status: done

Magic-link login, an authenticated customer area showing Licença status and expiry, and
self-service subscription cancellation. Scope matches `.scratch/backlog.md`'s "Magic-link
login" and "Customer area: Licença status, expiry, cancel" lines, under PLANNING.md §10's
0.1 milestone.

Depends on: `checkout-webhooks` (done) — the `subscriptions` table, the compare-and-swap
state-transition pattern, and the webhook's Appmax-authoritative-status re-fetch all exist
and are reused here rather than re-invented.

Governing docs: PLANNING.md §3 (platform constraints — signed cookie over D1 round-trip, no
KV for auth state), §4 (module layout — `identity/`, `licensing/`), §6 (webhook trust model,
compare-and-swap `UPDATE` pattern, Appmax as sole gateway), §7 (magic link, account
lifecycle), §8 (licensing and delivery — no per-customer key in 0.1, "issuance has a human
in it"), §11 (Open decisions — scheduled cancellation deferred), §5 (code conventions,
testing); CONTEXT.md (Cliente, Assinatura, Plano, Licença — Assinatura and Licença are
independent lifecycles); ADR-0003 (Appmax as gateway).

## Problem Statement

`checkout-webhooks` gets an Assinatura from `pending` to `active`, but nothing downstream
exists yet: the `subscriptions` table carries no Cliente identity at all (§7 — "the account
is provisioned from payment, not before it" — deliberately), there is no login, and
`identity/` and `licensing/` are both empty directories. A Cliente who paid has no way to
find out their Licença status, no way to see when it expires, and no way to cancel without
manual support — which breaks the FAQ's "cancelar quando quiser com um clique" promise and,
per PLANNING §6, is a CDC right this business has to provide itself since Appmax doesn't
ship a self-service portal.

## Solution

When a subscription is confirmed `active`, the webhook's existing authoritative
Appmax-status re-fetch (the same call `checkout-webhooks` ticket 04 already makes) is
extended to also capture the buyer's email and persist it as a `customers` row linked to
that subscription — the first point at which any Cliente identity exists in this system. A
Cliente can then request a magic link at `/login` by email: a short-lived, single-use token
is emailed (Resend, test mode until §12's domain-verification prerequisite lands), and
clicking it establishes a session. The session is a signed cookie (fast path, matches §3
exactly) whose validity a `sessions` D1 row can additionally revoke — checked only on
logout and on the cancel action, never on ordinary page loads, so §3's "no DB round-trip
per request" constraint holds for everything except those two sensitive operations.

The customer area shows the Cliente's Plano and their Licença status — "sendo preparada"
if no expiry is set yet, "ativa até DD/MM" once manual issuance (§8) sets one — using a new,
minimal `licenses` table. No key field: §8 states plainly there is no per-customer key in
0.1, only status and expiry. From that page, cancellation is one click plus one confirm
dialog, which calls Appmax's cancel API and then applies the same compare-and-swap `UPDATE`
pattern the webhook uses against `subscriptions.status`, so a customer-initiated cancel and
an in-flight webhook delivery can never race each other. Cancellation is immediate — the
Assinatura flips to `canceled` right away and the Licença keeps running to its own expiry
regardless, since the two are independent lifecycles (CONTEXT.md). Scheduled,
end-of-period cancellation is deferred (PLANNING §11).

## User Stories

1. As a Cliente whose payment was just confirmed, I want my email captured against my
   Assinatura, so that I have an identity to log in with later.
2. As a Cliente, I want to request a login link by entering my email at `/login`, so that I
   can access my account without a password.
3. As anyone submitting an email at `/login`, I want the same response whether or not that
   email matches a Cliente, so that the endpoint can't be used to check who has an account.
4. As an attacker or careless script, I want repeated rapid requests for the same email (or
   from the same source) to be throttled, so that I can't spam a stranger's inbox or brute
   the endpoint.
5. As a Cliente, I want my magic-link token to stop working shortly after it's issued and
   after first use, so that an intercepted or old email can't be replayed to log in as me.
6. As a Cliente who clicked a valid link, I want to land logged in, with a session that
   keeps me logged in across visits for a reasonable stretch of time, so that I'm not
   requesting a new link every time I want to check my status.
7. As a Cliente, I want a working logout that actually invalidates my session (not just
   clears my own cookie), so that logging out on a shared or lost device is meaningful.
8. As a logged-in Cliente, I want to see my Plano and my Licença's status and expiry, so
   that I know whether my access is active and until when.
9. As a logged-in Cliente whose Licença hasn't been issued yet, I want to see that it's
   being prepared rather than an error or a blank field, so that I don't think something
   is broken (§8 — issuance has a human in it).
10. As a logged-in Cliente, I want to cancel my Assinatura in one click plus a single
    confirmation, so that I don't need to contact support, but also don't cancel by
    accident.
11. As a Cliente who cancels, I want my Assinatura to stop billing immediately and my
    Licença to keep working until its own expiry, so that I get what I already paid for.
12. As the business, I want a customer-initiated cancel and a concurrently-arriving Appmax
    webhook event for the same subscription to never leave `subscriptions.status` in an
    inconsistent or flip-flopped state, so that the same compare-and-swap guarantee
    `checkout-webhooks` built for webhook delivery also holds for this new write path.
13. As an unauthenticated visitor, I want any customer-area route to redirect me to
    `/login` rather than error or leak data, so that the area is actually protected.

## Implementation Decisions

**Single active subscription per customer, for 0.1.** `customers` links to exactly one
`subscriptions` row. A second purchase under the same email is a known, accepted gap, not
data-modeled — PLANNING §1 already defers upgrade/downgrade to 1.0.0, so there's no product
behavior yet for a Cliente with two Assinaturas to exercise.

**Appmax's buyer-email field name is unverified**, same status as `order_id`
(`appmax-client.ts`'s header comment, PLANNING §13). No sandbox credentials existed when
that file was written or when this spec was drafted. If the real field differs, `customers`
rows won't populate and login has nothing to look up — verify against a real sandbox call
before go-live, same caveat §13 already carries for `order_id`.

**No `IPaymentProvider` abstraction, still.** Appmax's cancel call is one more direct call
from `modules/billing`, consistent with `checkout-webhooks`' existing stance (PLANNING §5).

**Session design — hybrid, not purely stateless.** A signed cookie (session id, issued-at,
expiry — 30 days) is checked on every normal request with no DB round-trip, matching §3's
explicit constraint. A `sessions` table in D1 is the revocation store: written at login,
deleted or marked revoked at logout, and consulted on the cancel-subscription action (the
one sensitive operation in this scope) in addition to the cookie check. This is the only
place in the customer area that reads D1 on every request by design; everywhere else stays
cookie-only.

**Magic-link token: 15 minutes, single-use, D1-stored**, mirroring the existing
`processed_webhooks` idempotency-by-insert pattern — redemption is a single statement that
both checks and consumes the token (e.g. an `UPDATE ... SET used_at = ? WHERE token = ? AND
used_at IS NULL AND expires_at > ?`), not a `SELECT` then a separate write, for the same
TOCTOU reason §6 gives for `subscriptions`.

**Login-request endpoint returns a generic response** ("se o e-mail existir, você receberá
um link") regardless of match, and applies a basic per-email and per-IP throttle. No captcha
or heavier abuse tooling — no evidence of abuse yet (§5's stance against speculative
generality).

**Cancellation is a compare-and-swap `UPDATE` against `subscriptions.status`**, reusing the
exact rigidity-ranking pattern `checkout-webhooks` ticket 04 built for the webhook, so the
webhook and this new customer-initiated write path share one state-transition rule instead
of two that could disagree.

**Licença status text**, per §8: `sendo preparada` (no `expires_at` set) or `ativa até
DD/MM` (once set). No key field — §8 states there is no per-customer key in 0.1; PLANNING
§1/§10's "key/expiry" milestone wording is stale relative to §8's body text and
`.scratch/backlog.md`'s own already-trimmed phrasing ("license status, expiry, cancel").

**Module boundary.** Customer/token/session code lives in `modules/identity`; the
`licenses` table and its status/expiry read live in `modules/licensing`; the cancel call and
the `subscriptions` CAS write stay in `modules/billing`, per PLANNING §4's existing layout.

## Testing Decisions

Vitest against the real Workers runtime and a real D1 binding (`@cloudflare/vitest-pool-workers`,
already added by `checkout-webhooks`), with only the outbound Appmax `fetch` and the
outbound Resend `fetch` mocked — consistent with `checkout-webhooks`' "one seam" rule,
extended to the one new outbound call this effort adds (Resend).

PLANNING §5 names token issuance and session validation as two of the three places "a bug
costs money or grants unauthorized access" (the third, the webhook, is already covered).
This effort is where both get their tests: token single-use/expiry enforcement, session
cookie validation, and session revocation actually taking effect.

Covered: magic-link request idempotent-looking response regardless of match, token
redemption exactly once (a replayed token fails), token expiry, session validity via cookie
without a DB hit, session revocation on logout and its effect on a subsequent request,
unauthenticated access to a customer-area route redirecting to `/login`, the Licença
status/expiry display in both the "preparada" and "ativa até" states, cancel's
compare-and-swap `UPDATE` against a concurrent webhook-driven update to the same row (mirrors
`checkout-webhooks` ticket 04's own concurrency test, one new writer added to the same
table).

The full login-to-cancel path also closes out §5's "Playwright covers one
checkout-to-customer-area happy path" — `checkout-webhooks` ticket 07 verified up through the
confirmation page only, since nothing downstream existed yet.

## Out of Scope

- Automated license issuance and per-customer keys — PLANNING §8, explicitly deferred to
  1.0.0 (license authority, entitlement enforcement).
- The signed download-link email — separate backlog item, not part of the customer area
  itself.
- Plan upgrade/downgrade, multi-subscription customers — PLANNING §1, deferred to 1.0.0.
- Scheduled (end-of-period) cancellation — PLANNING §11, recorded as an open decision.
- Multi-day dunning, chargeback handling — PLANNING §6, unrelated to this effort's scope.
- Any provider other than Appmax; any auth mechanism other than magic link (no passwords,
  per §7).
- Rate-limiting/abuse tooling beyond the basic throttle described above (captcha, device
  fingerprinting) — no evidence of need yet.

## Further Notes

- Appmax's buyer-email field name and its cancel-subscription API's exact request/response
  shape are both unverified against a live sandbox call, same caveat as `order_id` in §13 —
  confirm both before go-live.
- The hybrid session design is a direct response to a real tension: §3 mandates
  cookie-only validation for performance reasons, but a revocable session needs a
  server-side record. Keeping the D1 check confined to logout and cancel (never ordinary
  page loads) is what keeps both true at once — don't widen that DB check to every request
  without revisiting §3 itself.
- PLANNING.md §11 already carries the scheduled-cancellation deferral this spec assumes;
  no separate decision doc needed for it.
