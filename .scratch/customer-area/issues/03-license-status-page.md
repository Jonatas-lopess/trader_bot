# 03: Customer area — license status

**What to build:** the protected customer-area page showing a logged-in Cliente their
Plano and their Licença status/expiry.

Governing docs: spec.md's "Solution" and "Implementation Decisions" (no key field, status
text, module boundary); PLANNING.md §8 (licensing and delivery — no per-customer key in
0.1, "issuance has a human in it"). User Stories 8, 9, 13.

**Blocked by:** 02 (needs a session to gate the route), 01 (needs the `customers` ↔
`subscriptions` link to know which Plano to show).

**Status:** ready-for-agent

- [ ] A minimal `licenses` table (status, nullable `expires_at`), linked to a subscription,
      under `modules/licensing` per PLANNING §4. Rows are created/updated manually for 0.1
      (§8 — issuance has a human in it); this ticket only reads them.
- [ ] The customer-area route requires a valid session (ticket 02's guard); an
      unauthenticated visit redirects to `/login` (User Story 13).
- [ ] The page shows the Cliente's Plano name and Licença status: "sendo preparada" when
      `expires_at` is unset, "ativa até DD/MM" once it is set (User Story 8, 9). No key
      field — §8 has no per-customer key in 0.1.
- [ ] A logout control is present and uses ticket 02's logout action.
- [ ] Tests, against the real D1 binding: an authenticated request with no `licenses` row
      yet shows "sendo preparada"; one with `expires_at` set shows the formatted date; an
      unauthenticated request redirects to `/login`.
- [ ] `npm test` and `npm run typecheck` pass.
