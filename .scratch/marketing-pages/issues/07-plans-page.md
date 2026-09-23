# 07: Plans page

**What to build:** The `catalogo-planos` route (`6:217`), where a visitor picks a Plano. Title band, the Anual/Mensal toggle, three full comparison cards, the regulatory note, footer.

Frame contents: heading "Escolha o plano ideal para você"; toggle (`6:235`) defaulting to **Anual** with an "Economize 20%" badge beside it; three cards (`6:243`) — Starter R$ 97/mês, Pro R$ 197/mês with a "Mais Popular" ribbon and a taller card, Enterprise R$ 497/mês — each with a "Métricas e Recursos" list mixing `check-check` inclusions and `x-circle` exclusions; CTAs "Assinar Starter / Pro / Enterprise"; and a regulatory note (`6:340`) stating the product is not an investment recommendation.

This ticket owns the plan content file. The landing teaser (08) reads from it.

**The pricing model in the frame is incomplete and contradicts §6.**

The toggle offers Anual, marks it the default, and advertises 20% off — but every card shows `R$ 97 / mês` in both toggle states. There is no annual price in the file. PLANNING.md §6 says an annual plan is **a single charge steered toward Pix**: Pix is 0.99% settling in one day against card à vista 4.19% settling around D+31, roughly 3.2 points cheaper and a month earlier, and the page "should make Pix the obvious annual choice". The frame does neither — no annual figure, no Pix. Build the toggle mechanism and the content shape that holds both price sets, and surface the missing annual prices and the absent Pix steer as a decision for the user. Do not compute a 20% discount and present the result as the price.

No parcelamento anywhere: Pagar.me forbids installments on subscriptions and 0.1 does not model annual as a parcelled one-off (§6).

**Six feature-list rows sell things the product does not have.**

`Mercado de Criptomoedas`, `Mercados Forex + Cripto`, `Acesso a todos os mercados mundiais`, `Backtesting avançado de 5 anos` / `tick-by-tick`, `Gerente de conta dedicado 24/7`, `Servidor VPS de baixíssima latência incluso`, `Integração via API Personalizada`, `Acesso a setups premium validados`. The Robô is a single MT5 Expert Advisor licensed by expiry date and issued by hand (§8); none of these appear in any milestone in §10. A VPS and a 24/7 account manager are not copy, they are staffing and infrastructure commitments. Each row ships behind the launch-blocking marker with an owner decision attached: verify, scope, or delete.

**Entitlement copy ships exactly as sold.** "1 / 3 / Robôs ativos simultâneos" and "1 / 3 / Corretoras ilimitadas" stay, while nothing in 0.1 can count or cap either (§8). That gap is accepted and recorded — do not soften the copy unilaterally, and add no claim that limits are enforced. CONTEXT.md leaves **Robô ativo** and **Corretora vinculada** deliberately undefined; this page must not settle them by implication, which means no tooltip, footnote or helper text explaining what counts as one.

Checkout is Hosted Checkout (§6) and is not built here. Each CTA targets a checkout route that may be a stub.

**Figma:** `6:217` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-217

**Blocked by:** 03

**Status:** done

- [ ] Plans route renders through the site shell and matches frame `6:217` at 1440px, Pro card taller with its "Mais Popular" ribbon
- [ ] Card row collapses to a single column at mobile widths, Pro ordered sensibly in the stack
- [ ] Plan data lives in one typed content file, shaped to hold monthly and annual prices
- [ ] Toggle switches state; missing annual prices and the absent Pix steer are recorded as an owner decision, not invented
- [ ] Inclusion and exclusion rows are distinguishable without relying on icon colour alone
- [ ] No parcelamento or installment copy anywhere on the page
- [ ] Unbacked feature rows sit behind the launch-blocking marker
- [ ] No copy claims entitlements are enforced, and nothing defines Robô ativo or Corretora vinculada
- [ ] Regulatory note renders verbatim
- [ ] Each CTA navigates to the checkout route (stub acceptable)
