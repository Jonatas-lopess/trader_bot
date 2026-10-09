# 13: Price rows choose what the card's buy button buys

**What to build:** On each card from ticket 12 the price rows are the choice: the Cliente picks Licença Perpétua, Anual or Mensal and the single "Comprar <Robô>" button goes to checkout for that Oferta. Licença Perpétua is selected by default (the highlighted row in the wireframe); a Robô without Compra selects its first available row. The selected row takes the highlighted look, so it keeps matching the wireframe in its default state.

Behavior: pick a row with click or keyboard (arrow keys within the card's rows, focus ring visible), the button's destination updates to that `robot` + `offer`, and the selection is exposed to assistive tech as a radio group. Selecting is per card and does not scroll the carousel. Without JavaScript the button still works and buys the default Oferta.

The checkout link keeps carrying only `robot` + `offer`; the price is still looked up server-side (ADR-0006), never read from the page.

**Blocked by:** 12.

**Status:** ready-for-agent

- [ ] Clicking a row selects it, highlights it and the button goes to that Oferta's checkout
- [ ] Default selection is Licença Perpétua, or the first existing row when the Robô has no Compra
- [ ] Rows are operable by keyboard and announced as a radio group with the selected state
- [ ] With JavaScript off the button buys the default Oferta
- [ ] Carousel highlight, arrows and swipe still work; selecting a row never moves the track
- [ ] Checked in the browser at 1280 and 390 on a Robô with three, two and one Ofertas
- [ ] Typecheck and the full test suite pass
