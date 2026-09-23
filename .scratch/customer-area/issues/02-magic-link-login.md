# 02: Magic-link login

**What to build:** `/login` — a Cliente enters their email, receives a short-lived
single-use magic link (Resend, test mode per PLANNING §12), and clicking it establishes a
session that keeps them logged in without a password.

Governing docs: spec.md's "Solution" and "Implementation Decisions" (token TTL, login
throttle, hybrid session design); PLANNING.md §3 (signed cookie over DB round-trip, no KV
for auth state), §7 (magic link, no passwords). User Stories 2-7, 13.

**Blocked by:** 01 (needs `customers` to look up an email against).

**Status:** done

- [x] `/login` accepts an email and, regardless of whether it matches a `customers` row,
      returns the same generic response (User Story 3) and applies a basic per-email and
      per-IP throttle (User Story 4).
- [x] A matching email gets a single-use token, 15-minute TTL, stored in D1 (not KV, per
      §3). Redemption is one statement that both checks and consumes it (`UPDATE ... WHERE
      token = ? AND used_at IS NULL AND expires_at > ?`), not a `SELECT` then a write — same
      TOCTOU reasoning as §6's `subscriptions` CAS pattern (User Story 5).
- [x] The email is sent via Resend (test mode/sending per §12; domain verification is a
      go-live gate, not a build blocker).
- [x] Clicking a valid, unused, unexpired link sets a signed session cookie (session id,
      issued-at, expiry) and also writes a matching row in a `sessions` table (the
      revocation store). Normal requests validate the cookie only, no DB hit (User Story 6,
      spec.md's hybrid session design).
- [x] A logout action deletes/marks-revoked the `sessions` row and clears the cookie; a
      request replaying the old cookie after logout is rejected (checked against
      `sessions`) even though the cookie signature itself is still valid (User Story 7).
- [x] Any customer-area route with no valid session redirects to `/login` (User Story 13) —
      the actual protected routes are ticket 03's, but the session-check guard itself
      belongs here.
- [x] Tests, against the real D1 binding with the outbound Resend `fetch` mocked: token
      single-use enforcement (replay fails), token expiry, generic response for a
      non-matching email, session cookie validity without a DB hit, and revocation via
      logout actually rejecting a subsequent request.
- [x] `npm test` and `npm run typecheck` pass.

## Comments

Cookie payload carries `customerId` alongside `sessionId`/issued-at/expiry (not just
"session id, issued-at, expiry" as literally listed above) — `requireSession` (ticket 03's
page guard) needs the customer id on every request with zero DB hits, and the cookie is
already an HMAC-signed opaque blob, so this doesn't weaken it, just avoids a redundant
`sessions` lookup for something the signature already vouches for.

The "request replaying the old cookie after logout is rejected" bullet is satisfied at the
`isSessionValid`/`sessions` layer (what logout and, per ticket 04, cancel call) — not by
`requireSession` itself, which per spec.md's hybrid design never touches D1 on ordinary page
loads. A revoked session's cookie signature still verifies `ok: true` on an ordinary page
view; only the two sensitive actions (logout, cancel) see the revocation. This is the
designed behavior, not a gap — see spec.md's "don't widen that DB check to every request
without revisiting §3 itself."

`/login`'s form POST (`/login/request`) relies on Astro's built-in same-origin CSRF check
(an `Origin` header must match) — same thing `checkout-webhooks` ticket 07's manual-run notes
flagged for `/checkout`. Anything driving these routes without a browser (tests, curl) needs
an `Origin` header set.

Also done, adjacent to this ticket's own scope: `src/content/header.ts`'s `loginLink` is now
a real `NavLink` to `/login` instead of one of `src/content/dead-links.ts`'s inert entries;
`site-header.astro` renders it as a normal anchor.
