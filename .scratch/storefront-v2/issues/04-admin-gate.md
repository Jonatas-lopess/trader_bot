# 04: Admin gate: magic-link session plus `ADMIN_EMAILS`

**What to build:** `modules/identity/admin.ts` with `requireAdmin(request, env)`: valid session (existing `requireSession`), the Cliente's normalized email is in `ADMIN_EMAILS` (comma-separated, normalized with `normalize-email.ts`). Unset or empty means nobody is admin. Returns a discriminated union; the page/route adapters turn every non-admin result, signed in or not, into a plain 404 so the area's existence is not revealed (an unauthenticated visit may redirect to `/login` only if it does not leak, decide and record).

- `/admin` landing (SSR, `BaseLayout` with a minimal admin shell, link list) so the gate is demonstrable before 05.
- CSRF: a helper `assertSameOrigin(request)` for state-changing admin requests (POST/PUT/DELETE): `Origin` must equal the site origin, otherwise 403. Session cookie flags checked: `SameSite` set, record what `session.ts` sets.
- The admin must be able to log in: an admin who has never bought has no `customers` row, but magic-link login is keyed by `customers.email`. Decide and implement how an `ADMIN_EMAILS` address obtains a session (preferred: `login/request.ts` also issues a link for an allowlisted email, creating the identity row as `provisionCustomer` does, without a purchase); keep `/login/dev` semantics unchanged.
- `ADMIN_EMAILS` in `.dev.vars.example`, `wrangler.jsonc` (empty), types regenerated, PLANNING §12 notes it.

**Blocked by:** None (can start immediately).

**Status:** done

TDD seam: `requireAdmin` (no session, non-admin, admin, unset var, case/whitespace in the list), `assertSameOrigin`.

- [x] Non-admins and anonymous visitors get 404 on `/admin`; an allowlisted email reaches it
- [x] Unset `ADMIN_EMAILS` locks everyone out
- [x] An admin with no purchases can log in by magic link
- [x] Cross-origin POST to an admin route is rejected
- [x] Typecheck and the full test suite pass

## Comments

Decisions (implementation: `src/modules/identity/admin.ts`, `src/pages/admin.astro`, `src/content/admin.ts`).

- **Unauthenticated `/admin`: plain 404, no redirect to `/login`.** A redirect would tell an
  anonymous visitor that something lives at `/admin` while a signed-in non-admin got a 404, so the two
  cases would differ. Every non-admin result is the same empty 404 (Astro serves its normal 404 page for
  it; same body size as an unknown route). Admins reach the area by logging in at `/login` as usual, and
  the login redirect (below) drops them on `/admin`. The 200 response carries `Cache-Control: private,
  no-store`, and the shell emits `noindex, nofollow`.
- **Session cookie flags (unchanged, recorded as asked).** `pages/login/verify.ts` sets `HttpOnly`,
  `Secure` only when the request arrived over HTTPS (so plain-HTTP `wrangler dev` still logs in),
  `SameSite=Lax`, `Path=/`, expiry 30 days. `Lax` means a cross-site top-level GET carries the cookie,
  so admin GETs must never write; every state-changing admin route must call `assertSameOrigin`, which
  rejects a non-matching, missing or `null` `Origin` (403). Astro's own `checkOrigin` also covers form
  posts, but does not cover JSON or `fetch` bodies, hence the helper.
- **`requireAdmin` also reads the revocation row.** Beyond `requireSession` (cookie-only) it calls
  `isSessionValid`, so a logged-out admin's replayed cookie is refused; one extra D1 read (plus the
  e-mail lookup, since the session names a customer id) on rare admin requests. Stricter than the
  ticket's wording, same stance as the cancel-subscription action.
- **How an allowlisted address gets a link without a purchase.** `requestMagicLink` still looks up
  `customers` by normalized e-mail; when there is no row and the address is in `ADMIN_EMAILS` it inserts
  the bare identity row (`id`, `email`, the same insert `provisionCustomer` does, `ON CONFLICT DO
  NOTHING`) and issues the link. No purchase, Licença or Cliente-facing artifact exists: `/conta` still
  redirects a Cliente with no purchases to `/login`. The response stays the generic one, a non-listed
  stranger still creates nothing, and `/login/dev` is untouched (it still needs an existing row). Later
  purchases by the same e-mail attach to this row, since identity is per e-mail (ADR-0006).
- **Post-login landing.** `/login/verify` used to send everyone to `/conta`, which bounces a Cliente
  with no purchases back to `/login`, so an admin who never bought would loop. `landingPathAfterLogin`
  sends an allowlisted Cliente with zero purchases to `/admin`; everyone else (including an admin who
  also bought) still goes to `/conta`.
- **Config.** `ADMIN_EMAILS` is in `.dev.vars.example`, `wrangler.jsonc` `vars` (empty) and PLANNING §12.
  Because a `wrangler.jsonc` var overwrites a dashboard value on deploy, `ci.yml` passes it as
  `--var ADMIN_EMAILS:...` from the `dev` Environment variable of the same name when set. The types
  regenerate as `""`, so the helpers take `{ ADMIN_EMAILS?: string }`. No migration (0016 unused).
- **Shell for tickets 05 and 16.** `BaseLayout` has `shell="admin"` (header `admin-header.astro`, the
  account footer). Append an entry to `adminSections` in `src/content/admin.ts`: entries under `/admin/`
  become header tabs, all entries become landing cards.
