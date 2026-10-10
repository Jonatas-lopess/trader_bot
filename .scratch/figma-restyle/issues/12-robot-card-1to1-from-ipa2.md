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

**Status:** ready-for-human

- [x] Viewed next to `ipa2.png` at 1280: structure, spacing, type, colors and radii match; every difference is listed in the comments, with the reason
- [x] Viewed at 390: no horizontal scroll, no price wrapping
- [x] Price rows show Licença Perpétua / Anual / Mensal in order, only the Ofertas the Robô sells
- [x] The buy button reads "Comprar <name>", outline on regular cards and filled on the highlighted one
- [x] Withdrawal note stays; tag, Pix note, 20% badge and captions are gone, with their dead content exports removed
- [ ] Coming-soon and partial-offer cards render sensibly; owner has viewed them in the browser
- [x] Buy links still carry only `robot` + `offer` (ADR-0006)
- [x] Existing catalog tests updated for the removed copy; typecheck and the full test suite pass

## Comments

2026-10-09 (agent): built and checked in headless Chromium against a static `astro build` (the dev server does not start in this sandbox: "Dev server failed to start within 30s"). The wireframe was scaled so its card matched the 352px catalog card and compared crop by crop; also viewed at 390 (document `scrollWidth` equals `clientWidth`, prices on one line). Only the owner's browser review of the coming-soon and partial-offer cards stays open, so the status is `ready-for-human`.

Differences from `ipa2`, with the reason:

- **No "Exemplo destaque" tag**: owner decision, not carried.
- **Prices read "R$ 997" / "R$ 497" / "R$ 97"**, not "R$ 1.290,00" and "/ ano", "/ mês": the card keeps the shared `formatBrl` (also used by the landing teaser) and this ticket lists no period suffix; the row label already says Anual / Mensal. Add the suffixes if the owner wants them.
- **"Licença Perpétua / Anual / Mensal"** instead of the wireframe's "Assinatura Anual / Mensal": owner choice (2026-10-09), Assinatura is reserved for Mensal (CONTEXT.md).
- **Description colour is `text-secondary`**, the wireframe's is dimmer (about `text-tertiary`): ticket 07 found `text-tertiary` fine print unreadable.
- **Buttons are 44px tall** (`button-h-sm`) against about 40px in the wireframe, and the price rows are about 35px against about 32px: the existing size tokens and a tap-friendly row; no one-off pixel sizes added.
- **Row and button radius is `rounded-sm` (8px)**, the card `rounded-lg` (16px): nearest tokens to what the wireframe draws.
- **Highlighted price row uses `surface-emphasis`** (the wireframe's blue-grey fill), the others `surface-sunken` with a `border-subtle` outline.
- **Check icon is Lucide `CheckCheck` in `brand-primary`** on every card (the wireframe's checks are the same blue on regular cards, a lighter blue on the centre one).
- **Cards stretch to equal height** and the price rows plus button sit at the bottom (`mt-auto`), so a Robô with fewer rows leaves its gap above them, not below. The wireframe's three cards have identical content so it does not show this.
- **Withdrawal note under the button** is not in the wireframe; it stays by the ticket (withdrawal-guarantee 03).
- Only the carousel's centre card is highlighted (name, "Detalhes do Robô" and the button turn brand-coloured, with the existing border, glow and scale); with fewer than three cards none is, so every button is outline.
- Not in the wireframe, derived from the same pattern: the coming-soon card (name, "Em breve" label, Estratégia row, no price rows or button) and the one- and two-row cards.
