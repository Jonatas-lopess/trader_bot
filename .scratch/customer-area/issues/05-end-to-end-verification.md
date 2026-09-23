# 05: End-to-end verification — login-to-cancel happy path

**What to build:** the Playwright happy path from a confirmed payment through login,
license status, and cancellation — closing out PLANNING §5's "Playwright covers one
checkout-to-customer-area happy path", which `checkout-webhooks` ticket 07 only carried
through the confirmation page since nothing downstream existed yet.

Governing docs: spec.md's "Testing Decisions"; PLANNING.md §5. Depends on tickets 02-04
all being in place to exercise the full loop.

**Blocked by:** 02, 03, 04.

**Status:** done

- [x] Playwright: a Cliente with a confirmed subscription (ticket 01's provisioning)
      requests a magic link, redeems it, lands on the customer area, sees their Licença
      status, cancels with the confirm step, and sees the status update to canceled.
- [x] Test: an expired or already-used magic-link token is rejected end to end (not just at
      the unit level).
- [x] Test: logging out and then reusing the old session cookie is rejected end to end.
- [x] Manual/local run: exercise `/login` → customer area → cancel against a local Appmax
      sandbox (or this effort's mocked equivalent) at least once, per the repo's general
      "test the golden path in a browser" practice.
- [x] `npm test` and `npm run typecheck` pass.

## Comments

**No Playwright.** This repo has never actually installed Playwright or any browser-automation
tooling — the word only ever appeared in PLANNING.md/spec.md prose. `checkout-webhooks` ticket
07 hit the identical wording and resolved it as a vitest integration test
(`src/modules/billing/e2e.test.ts`) against the real Workers runtime/D1 binding, only the
outbound provider `fetch` mocked. This ticket follows that precedent exactly:
`src/modules/identity/e2e.test.ts` covers the happy path (webhook → `customers` row → magic
link → session → `/conta` resolves Plano+Licença → cancel → status reflects `canceled`), a
replayed token, a separately-issued expired token, and logout revocation's actual effect
(`isSessionValid` false; the DB-only check `/conta/cancelar` relies on, not the cookie-only
page guard, which is unaffected by design — spec.md's hybrid session model).

`src/pages/conta/cancelar.ts`'s session-recheck-then-cancel orchestration was left inline in
the Astro route rather than extracted into a plain module function — its three building
blocks (`requireSession`, `isSessionValid`, `cancelSubscription`) are each already unit/e2e
tested on their own, and the manual run below exercised the route itself end to end over real
HTTP, so a fourth extraction purely for testability felt like scope beyond what this ticket
needs.

**Manual run** (`wrangler dev --port 8791 --local`, migrations applied via
`wrangler d1 migrations apply trader-bot-db --local`, a `customers`/`subscriptions` row
inserted directly via `wrangler d1 execute --local` standing in for a real Appmax-confirmed
payment — same substitution ticket 07's own manual run made for `/checkout`):

- `GET /login` → 200. `GET /conta` unauthenticated → 302 to `/login` (User Story 13).
- `POST /login/request` (real Resend call, placeholder key, fails predictably, no crash) →
  303 to `/login?sent=1`; a `login_tokens` row was created.
- `GET /login/verify?token=...` → 303 to `/conta` with a real `Set-Cookie: session=...;
  HttpOnly; Secure; SameSite=Lax`.
- `GET /conta` with that cookie → 200, rendering "Plano: Pro", "Licença: Sendo preparada",
  "Assinatura: Ativa", the cancel-confirm script, and the logout form — all resolved through
  the real route, real D1, real session-cookie verification.
- `POST /conta/cancelar` with the cookie (missing `Origin` header first gave Astro's own CSRF
  403, exactly the same gotcha ticket 07 already documented for `/checkout`; retried with
  `Origin` set) → reached the real Appmax sandbox auth endpoint with placeholder credentials,
  failed there predictably (same shape as ticket 07's `/checkout` finding), redirected 303 to
  `/conta`, `subscriptions.status` correctly left `active` — proving the real HTTP/env/D1
  plumbing for cancel end to end, though the actual Appmax-success path can't be manually
  verified without real sandbox credentials (PLANNING.md §12/§13).
- `POST /logout` → 303 to `/login`, cookie cleared, `sessions` row deleted.
- Reusing the old (logout'd) cookie on `GET /conta` → still 200 (correct: the page guard is
  cookie-only by design, spec.md's hybrid model). Reusing it on `POST /conta/cancelar` → 303
  to `/login` (correct: this route re-checks `sessions`, User Story 7/ticket 04's DB
  re-validation) — the one concrete proof that revocation is enforced exactly where the
  design says it is, not everywhere.
