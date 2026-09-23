# 05: Intermediate confirmation page

**What to build:** the page a Cliente lands on right after paying — it never trusts the
redirect alone, polls the status endpoint, and shows the right message for the card path
and the Boleto path (including the "up to a business day" branch).

Governing docs: spec.md's Solution section and §7's "Checkout sequence" in PLANNING.md.
User Stories 3-5.

**Blocked by:** 02 (needs a real checkout redirect to land from), 03 (needs the status
endpoint to poll).

**Status:** ready-for-agent

- [ ] Page resolves state server-side by the checkout attempt's reference/session id
      rather than trusting the redirect's own claim of success (§7).
- [ ] Page polls the status endpoint from ticket 03 at ~2s interval (no WebSocket, no
      Durable Object).
- [ ] `pending` state shows "Aguardando confirmação do pagamento…".
- [ ] `active` state shows a confirmed message ("Entrar na área do cliente" per §7 — the
      actual login destination is out of scope, this just reflects the state).
- [ ] The Boleto-specific awaiting state shows copy distinguishing it from generic pending
      — "confirmação em até 1 dia útil" (User Story 4), not a stale "aguardando" message
      with no explanation (User Story 5).
- [ ] Manual/local verification: drive the page against a seeded D1 row in each of the
      three states and confirm the copy switches correctly as the polled status changes.
- [ ] `npm run typecheck` passes.
