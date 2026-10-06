# 02: How a Cliente requests the 7-day withdrawal

**Blocked by:** — (01 and 04 resolved)

**Status:** ready-for-agent

**What to build:** a defined path from "I want my money back" to the manual refund in `docs/ops/withdrawal-refund.md`. 0.1 has no self-service refund (PLANNING §9), so the request is an e-mail to support, made easy and unambiguous.

- On `/conta`, each Licença/Compra inside the window shows "Solicitar arrependimento", a `mailto:` to `supportEmail` with subject and body prefilled (purchase id, Cliente e-mail, "exerço o direito de arrependimento, CDC art. 49"). Outside the window the link is gone and the Termos clause is the only reference.
- The window is a pure function of `purchases.created_at` (7 days), unit-tested at the boundary. Whether the count starts at purchase or at delivery of the Licença is a legal call (art. 49 says "assinatura ou recebimento"); 0.1 counts from purchase (owner decision, 04); the lawyer confirms, wording `launchBlocking`.
- `docs/ops/withdrawal-refund.md` step 1 starts from the e-mail: what to verify, reply template, target answer time "até 2 dias úteis" (owner decision, 04; `launchBlocking`). Replies come from a plain mailbox, not Resend.
- Mensal: only the first charge is inside the right. Settled in 04: renewals reuse the one `purchases` row (`created_at` never moves), so `withdrawalWindowOpen(created_at)` needs no Mensal special case.

- [ ] `withdrawalWindowOpen(createdAt, now)` with boundary tests (day 7 inclusive, day 8 closed)
- [ ] `/conta` shows the request link only inside the window, with prefilled `mailto:`
- [ ] Copy in `src/content/conta.ts`, `launchBlocking`
- [ ] Runbook updated: request intake, reply template, SLA, and for Mensal a step to cancel the Appmax subscription alongside the refund (04)
- [ ] `pnpm test` passes

## Decisions / Notes

- Already-downloaded binary keeps running after revocation (runbook, last paragraph). The lawyer should see this when wording the clause.
- Nota fiscal already issued for a refunded purchase: backlog item, ask the contador.
