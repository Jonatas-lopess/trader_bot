# 12: End-to-end verification

**Blocked by:** 03, 04, 07, 08

**Status:** ready-for-agent

**What to build:** Playwright happy path from `/catalog` to a downloaded per-Licença binary: choose Compra, pay (Stripe test driver), confirm, log in, enter Corretora account, operator flips `active`, download. Plus branches: Boleto pending, amount-mismatch `rejected` page, Mensal cancel, refund revokes the Licença.

- [ ] Happy path and the four branches green
- [ ] `pnpm test` and `pnpm run typecheck` pass

