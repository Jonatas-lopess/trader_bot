# 04: Landing — hero section

**What to build:** The landing route exists and its above-the-fold section is real. A visitor at `/` sees the badge, headline, supporting paragraph, two CTAs and the trust row from frame `6:18`, beside the hero visual.

Contents of the frame: badge "Nova Versão 2.4"; headline "Automação inteligente. Resultados consistentes no mercado financeiro."; a paragraph about operating 24h with "disciplina matemática inabalável"; buttons "Começar Agora" and "Ver Planos"; a trust row of "Conexão API Segura" and "Zero taxas ocultas". `hero-right` (`6:36`) is an empty 600x400 rounded rectangle — there is no asset. Ship a token-styled placeholder and flag the missing asset; do not invent a screenshot.

**Three copy problems in this frame block launch, and the headline is the worst of them.**

1. "Resultados consistentes" is the exact register PLANNING.md §2 names as processor risk — Stripe's prohibited list covers services promising high rewards, and Pagar.me onboarding approval is a live prerequisite (§12). It is also a performance claim under CDC art. 37. The headline as drawn cannot ship.
2. "Nova Versão 2.4" implies a release history that nothing in the repo substantiates.
3. "Zero taxas ocultas" is a pricing claim; it holds only if the plans page carries no surcharge, which is 08's business.

Build the section to the frame, put every one of those strings in the content file behind the same placeholder marker 06 uses, and surface the headline as the highest-priority copy decision. Rewriting it is the user's call, not the implementer's.

The file has no mobile artboard. Stacking and type scaling at narrow widths are derived from the desktop frame (§2).

**Figma:** `6:18` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-18

**Blocked by:** 03

**Status:** done

- [ ] `/` route renders through the site shell
- [ ] Hero matches frame `6:18` at 1440px
- [ ] Hero stacks to a single column at mobile widths without overflow or clipped type
- [ ] "Começar Agora" and "Ver Planos" both navigate to the plans route (stub until 08)
- [ ] `hero-right` renders a deliberate placeholder; the missing asset is recorded
- [ ] Headline, version badge and trust-row claims sit in the content file behind the launch-blocking marker
