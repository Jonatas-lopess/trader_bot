# 04: Admin gate: magic-link session plus `ADMIN_EMAILS`

**What to build:** `modules/identity/admin.ts` with `requireAdmin(request, env)`: valid session (existing `requireSession`), the Cliente's normalized email is in `ADMIN_EMAILS` (comma-separated, normalized with `normalize-email.ts`). Unset or empty means nobody is admin. Returns a discriminated union; the page/route adapters turn every non-admin result, signed in or not, into a plain 404 so the area's existence is not revealed (an unauthenticated visit may redirect to `/login` only if it does not leak, decide and record).

- `/admin` landing (SSR, `BaseLayout` with a minimal admin shell, link list) so the gate is demonstrable before 05.
- CSRF: a helper `assertSameOrigin(request)` for state-changing admin requests (POST/PUT/DELETE): `Origin` must equal the site origin, otherwise 403. Session cookie flags checked: `SameSite` set, record what `session.ts` sets.
- The admin must be able to log in: an admin who has never bought has no `customers` row, but magic-link login is keyed by `customers.email`. Decide and implement how an `ADMIN_EMAILS` address obtains a session (preferred: `login/request.ts` also issues a link for an allowlisted email, creating the identity row as `provisionCustomer` does, without a purchase); keep `/login/dev` semantics unchanged.
- `ADMIN_EMAILS` in `.dev.vars.example`, `wrangler.jsonc` (empty), types regenerated, PLANNING §12 notes it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

TDD seam: `requireAdmin` (no session, non-admin, admin, unset var, case/whitespace in the list), `assertSameOrigin`.

- [ ] Non-admins and anonymous visitors get 404 on `/admin`; an allowlisted email reaches it
- [ ] Unset `ADMIN_EMAILS` locks everyone out
- [ ] An admin with no purchases can log in by magic link
- [ ] Cross-origin POST to an admin route is rejected
- [ ] Typecheck and the full test suite pass
