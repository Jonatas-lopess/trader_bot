# 02: Magic-link login

**What to build:** `/login` — a Cliente enters their email, receives a short-lived
single-use magic link (Resend, test mode per PLANNING §12), and clicking it establishes a
session that keeps them logged in without a password.

Governing docs: spec.md's "Solution" and "Implementation Decisions" (token TTL, login
throttle, hybrid session design); PLANNING.md §3 (signed cookie over DB round-trip, no KV
for auth state), §7 (magic link, no passwords). User Stories 2-7, 13.

**Blocked by:** 01 (needs `customers` to look up an email against).

**Status:** ready-for-agent

- [ ] `/login` accepts an email and, regardless of whether it matches a `customers` row,
      returns the same generic response (User Story 3) and applies a basic per-email and
      per-IP throttle (User Story 4).
- [ ] A matching email gets a single-use token, 15-minute TTL, stored in D1 (not KV, per
      §3). Redemption is one statement that both checks and consumes it (`UPDATE ... WHERE
      token = ? AND used_at IS NULL AND expires_at > ?`), not a `SELECT` then a write — same
      TOCTOU reasoning as §6's `subscriptions` CAS pattern (User Story 5).
- [ ] The email is sent via Resend (test mode/sending per §12; domain verification is a
      go-live gate, not a build blocker).
- [ ] Clicking a valid, unused, unexpired link sets a signed session cookie (session id,
      issued-at, expiry) and also writes a matching row in a `sessions` table (the
      revocation store). Normal requests validate the cookie only, no DB hit (User Story 6,
      spec.md's hybrid session design).
- [ ] A logout action deletes/marks-revoked the `sessions` row and clears the cookie; a
      request replaying the old cookie after logout is rejected (checked against
      `sessions`) even though the cookie signature itself is still valid (User Story 7).
- [ ] Any customer-area route with no valid session redirects to `/login` (User Story 13) —
      the actual protected routes are ticket 03's, but the session-check guard itself
      belongs here.
- [ ] Tests, against the real D1 binding with the outbound Resend `fetch` mocked: token
      single-use enforcement (replay fails), token expiry, generic response for a
      non-matching email, session cookie validity without a DB hit, and revocation via
      logout actually rejecting a subsequent request.
- [ ] `npm test` and `npm run typecheck` pass.
