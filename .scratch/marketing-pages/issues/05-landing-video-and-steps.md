# 05: Landing — video section and "4 passos"

**What to build:** The two explanatory bands below the hero, in frame order: `video-section` (`6:38`) first, then `how-it-works` (`6:48`).

Video section: badge "Demonstração", heading "Veja o robô em ação", a paragraph promising a 2-minute tour, and a 960x540 player. The frame contains `video-player-mock` (`6:44`) — a rectangle with a play button, not an embed. **No video exists and no YouTube URL has been provided.** Build the responsive 16:9 container and the poster/play state; wire the iframe behind a content-file value that is currently empty, and make the empty state deliberate rather than a broken embed. PLANNING.md §3 fixes the mechanism: a directly loaded YouTube iframe, no facade library. The copy promises "2 minutos" — that number is a claim about an asset nobody has made; flag it with the others.

How it works: badge "Simplicidade", heading "Configuração rápida em 4 passos", and a four-card row (`6:54`) — 01 Escolha seu plano, 02 Instale o robô, 03 Configure sua corretora, 04 Deixe o robô operar. The row collapses to a single column at mobile widths (§2).

**Step 03 contradicts the domain model and step 04 contradicts the delivery model.**

- Step 03 says "Conecte sua conta via chave de API protegida". CONTEXT.md defines **Chave** as the credential that lets an installed Robô run — not a Corretora API key. Two different secrets are being called the same word on the page that explains the product. Either the copy changes or CONTEXT.md gains a second term; this ticket does not get to decide which, but it must not ship the collision silently.
- Step 04 says "Ative a chave" as if a Chave arrives with the purchase. It does not: issuance has a human in it (PLANNING.md §8), and boleto adds up to a business day before anything starts (§7). Step copy must not promise an instant Chave.
- Step 02's "instalação assistida para sistemas operacionais modernos" describes a deliverable — an installer — that no milestone in §10 contains. The product is an MT5 Expert Advisor.

Vocabulary follows CONTEXT.md: **Robô**, **Cliente**, **Corretora**, **Plano**, **Licença**. Not bot, software, usuário, broker.

**Figma:** `6:38` and `6:48` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-38

**Blocked by:** 03

**Status:** done

- [ ] Both sections match their frames at 1440px, in frame order (video above steps)
- [ ] Video container is responsive 16:9 with a deliberate empty state; iframe URL comes from the content file
- [ ] Four-step row collapses to a single column at mobile widths
- [ ] Step copy uses CONTEXT.md vocabulary and avoids the banned terms
- [ ] No step claims an instant Chave, an installer, or immediate access
- [ ] The Chave / chave de API collision is recorded as an open question, not resolved by the implementer
- [ ] "2 minutos" and the missing video asset are recorded with the other launch blockers
