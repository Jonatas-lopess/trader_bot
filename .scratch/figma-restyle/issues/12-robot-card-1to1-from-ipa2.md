# 12: Catalog card is a 1:1 copy of the `ipa2` wireframe

**What to build:** The Robô card on `/catalog` takes the exact look of the wireframe [ipa2](../wireframes/ipa2.png) (the catalog cards adapted to the catalog pivot): same structure, spacing, type, colors, radii and borders, checked side by side against the PNG at desktop width and again at phone width. Colors, radii and fonts come from the existing tokens (tickets 01 to 03); nothing is hard-coded.

Draw, top to bottom:

- Robô name in upper case, then the short description in small, quiet text, then a divider.
- A small upper-case "Detalhes do Robô" heading, then the info rows from ticket 11, each with a check icon.
- Price rows, one per Oferta the Robô sells, in Compra / Anual / Mensal order: **Licença Perpétua**, **Anual**, **Mensal** (not "Assinatura Anual/Mensal": the glossary keeps Assinatura for the Mensal recurring agreement only, owner chose this 2026-10-09). Label on the left, price on the right in the heading font. The Licença Perpétua row is drawn with the raised, highlighted background; the others with the sunken one.
- One buy button, "Comprar <Robô name>". Outline style on regular cards, filled brand style on the centre-highlighted card of the carousel (the existing highlight: brand border, glow, scale). Ticket 13 makes the rows choose what the button buys; until then it buys Compra.
- Under the button, only the 7-day withdrawal note with its "Saiba mais" link (withdrawal-guarantee 03, legal, stays).

Not carried: the "Exemplo destaque" tag (owner: no tag), the annual "Pix" note, the "Economize 20%" badge and the offer captions under each price. Remove their now-unused content exports, and the unused `annualSavingsBadge` launch-blocking entry if nothing else reads it.

A coming-soon Robô keeps the "Em breve" label and no buy button or price rows; a Robô that sells fewer than three Ofertas shows only those rows. The wireframe draws neither, so they are derived from the same card pattern and the owner reviews them in the browser.

The landing catalog teaser is not restyled here.

**Blocked by:** 11.

**Status:** ready-for-agent

- [ ] Viewed next to `ipa2.png` at 1280: structure, spacing, type, colors and radii match; every difference is listed in the comments, with the reason
- [ ] Viewed at 390: no horizontal scroll, no price wrapping
- [ ] Price rows show Licença Perpétua / Anual / Mensal in order, only the Ofertas the Robô sells
- [ ] The buy button reads "Comprar <name>", outline on regular cards and filled on the highlighted one
- [ ] Withdrawal note stays; tag, Pix note, 20% badge and captions are gone, with their dead content exports removed
- [ ] Coming-soon and partial-offer cards render sensibly; owner has viewed them in the browser
- [ ] Buy links still carry only `robot` + `offer` (ADR-0006)
- [ ] Existing catalog tests updated for the removed copy; typecheck and the full test suite pass
