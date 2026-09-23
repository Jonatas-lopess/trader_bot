# 05: End-to-end verification — login-to-cancel happy path

**What to build:** the Playwright happy path from a confirmed payment through login,
license status, and cancellation — closing out PLANNING §5's "Playwright covers one
checkout-to-customer-area happy path", which `checkout-webhooks` ticket 07 only carried
through the confirmation page since nothing downstream existed yet.

Governing docs: spec.md's "Testing Decisions"; PLANNING.md §5. Depends on tickets 02-04
all being in place to exercise the full loop.

**Blocked by:** 02, 03, 04.

**Status:** ready-for-agent

- [ ] Playwright: a Cliente with a confirmed subscription (ticket 01's provisioning)
      requests a magic link, redeems it, lands on the customer area, sees their Licença
      status, cancels with the confirm step, and sees the status update to canceled.
- [ ] Test: an expired or already-used magic-link token is rejected end to end (not just at
      the unit level).
- [ ] Test: logging out and then reusing the old session cookie is rejected end to end.
- [ ] Manual/local run: exercise `/login` → customer area → cancel against a local Appmax
      sandbox (or this effort's mocked equivalent) at least once, per the repo's general
      "test the golden path in a browser" practice.
- [ ] `npm test` and `npm run typecheck` pass.
