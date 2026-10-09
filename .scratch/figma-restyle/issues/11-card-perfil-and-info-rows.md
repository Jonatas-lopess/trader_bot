# 11: Card info rows: Perfil field and the Estratégia / Mercado / Perfil shape

**What to build:** The new catalog card (wireframe [ipa2](../wireframes/ipa2.png)) lists three facts under "Detalhes do Robô": Estratégia, Mercado and Perfil. Today the card lists Estratégia, Mercado and "Corretoras compatíveis". `Perfil` (the risk and horizon profile of a Robô, drawn as "Conservador / Médio Prazo") becomes an optional Robô fact, shipped as launch-blocked placeholder copy like the other claims. The card's info rows become Estratégia, Mercado, Perfil, each shown only when the Robô declares it (no dash, no "a definir"); Estratégia always shows. "Corretoras compatíveis" leaves the card.

The five placeholder Robôs stay as they are. None is given a `Perfil` here, so the row simply does not appear until real data exists. No price, slug or offer changes.

Copy goes in the typed content files, never inline in markup; anything unverified stays `launchBlocking`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A Robô can declare a `Perfil`, and it is launch-blocked like the other strategy claims
- [ ] The card view-model yields Estratégia, then Mercado and Perfil only when present
- [ ] "Corretoras compatíveis" is no longer an info row on the card (the Robô's supported Corretoras data is kept; only `/catalog` read it, check nothing else breaks)
- [ ] Content tests cover the row order and the omitted-when-absent behavior
- [ ] Typecheck and the full test suite pass
