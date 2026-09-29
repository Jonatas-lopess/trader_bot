# 09: Termos de uso: 7-day withdrawal clause

**Blocked by:** —

**Status:** ready-for-agent

**What to build:** add the CDC art. 49 *arrependimento* section to the Termos de uso structure in `src/content/legal.ts`, placeholder text with a TODO for real wording from a lawyer, behind `launchBlocking`. Ops note in `docs/ops/`: manual refund via Appmax, revoke Licença (expiry to now via the ticket 05 function).

Governing docs: ADR-0006 "Withdrawal", PLANNING.md §9.

- [ ] Clause present, `launchBlocking`, listed by the grep in `legal.ts`
- [ ] `pnpm test` passes (`legal.test.ts`)

