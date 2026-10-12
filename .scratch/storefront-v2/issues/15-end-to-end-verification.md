# 15: End-to-end verification

**What to build:** One verification pass over the whole effort, following `catalog-e2e.test.ts` / `e2e.test.ts` style (D1 real, outbound `fetch` mocked) plus a browser run recorded in Comments.

- Test: admin creates and publishes a Robô → public catalog card and "Saiba mais" modal show it → price edit changes the next checkout → a cart with two Licenças of the same Robô and one other pays → one Appmax order, 3 rows → webhook activates → one Cliente, 3 Licenças, one login link → each Licença accepts its own Corretora account.
- Test: draft/archived Robô cannot be priced; a cart with a tampered price or a `monthly` line is rejected; non-admin gets 404 on every `/admin` route.
- Browser (390 and 1280): grid, modal, add to cart, cart page, checkout with N lines against the Stripe/mocked paths available, Encomenda submit (including a forced send failure landing in the dead letter and being resent from the admin), admin CRUD. Note the Appmax sandbox items still gated by `appmax-checkout` 08.
- Update README, `TODO.md`, `docs/agents/content-files.md`, ROTEIRO-TESTES.md with the new flows and the dev seed command.

**Blocked by:** 01, 05, 07, 09, 13, 14, 16.

**Status:** ready-for-agent

- [ ] The test above passes in the suite
- [ ] Browser run recorded with any defects filed as new tickets
- [ ] Docs updated
- [ ] Typecheck and the full test suite pass
