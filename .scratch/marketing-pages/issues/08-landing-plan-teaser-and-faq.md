# 08: Landing — plan teaser and FAQ

**What to build:** The last two bands of the landing page: `quick-comparison` (`6:121`) and `faq-section` (`6:160`).

Quick comparison: badge "Planos Simplificados", heading "Comece no seu ritmo", three condensed plan cards (Starter R$ 97, Pro R$ 197, Enterprise R$ 497 — each with a single headline entitlement) and a "Ver planos completos" button pointing at the plans route. These prices and entitlements are the same facts the plans page sells, so they read from the shared plan content file that 07 owns. Duplicating them into a second file guarantees the two pages disagree the first time a price moves — that is why this ticket is blocked by 07 rather than by 03 alone.

FAQ: heading "Perguntas Frequentes" over five items (`6:165`). Four of the five answers make commitments that outrun what PLANNING.md describes:

- **"É seguro? — Totalmente seguro."** An unqualified safety guarantee for a product whose own footer disclaimer says all execution risk sits with the user. The answer's substance (no withdrawal authorisation, funds stay at the Corretora) is accurate and worth keeping; the absolute is not.
- **"Quais corretoras são compatíveis?"** claims the largest global Forex houses plus national and international crypto exchanges. The Robô is an MT5 Expert Advisor (§8). This answer needs a verified compatibility list or it must go.
- **"Preciso de experiência anterior?"** promises "configurações pré-ajustadas e tutoriais completos em português" — a documentation deliverable absent from every milestone in §10.
- **"Posso cancelar a qualquer momento?"** promises cancelling "com um clique". PLANNING.md §6 records that Pagar.me ships no self-service portal, so that one click is UI we build; §1 keeps it in 0.1's customer area. The promise is honourable but not yet honoured — the answer must not describe a flow more generous than what gets built, and no answer may promise plan upgrade or downgrade, which is 1.0.0 (§10).

Answers touching payment must match §6: card à vista and boleto can carry an Assinatura, Pix is one-time only, and there is no parcelamento in 0.1.

**Figma:** `6:121` and `6:160` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-121

**Blocked by:** 03, 07

**Status:** ready-for-agent

- [ ] Both sections match their frames at 1440px and collapse cleanly at mobile widths
- [ ] Teaser cards read prices and entitlements from the plan content file created in 07 — no second copy
- [ ] "Ver planos completos" navigates to the plans route
- [ ] FAQ is keyboard-navigable and screen-reader-sane, not a div-only accordion
- [ ] Unverified compatibility, absolute-safety and tutorial claims sit behind the launch-blocking marker
- [ ] Cancellation answer matches what the customer area will actually do; no upgrade/downgrade promise
- [ ] Payment answers match PLANNING.md §6 — no parcelamento, no recurring Pix
- [ ] Copy uses CONTEXT.md vocabulary (Assinatura, Licença, Chave, Plano, Corretora)
