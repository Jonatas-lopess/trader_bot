# 13: Price rows choose what the card's buy button buys

**What to build:** On each card from ticket 12 the price rows are the choice: the Cliente picks Licença Perpétua, Anual or Mensal and the single "Comprar <Robô>" button goes to checkout for that Oferta. Licença Perpétua is selected by default (the highlighted row in the wireframe); a Robô without Compra selects its first available row. The selected row takes the highlighted look, so it keeps matching the wireframe in its default state.

Behavior: pick a row with click or keyboard (arrow keys within the card's rows, focus ring visible), the button's destination updates to that `robot` + `offer`, and the selection is exposed to assistive tech as a radio group. Selecting is per card and does not scroll the carousel. Without JavaScript the button still works and buys the default Oferta.

The checkout link keeps carrying only `robot` + `offer`; the price is still looked up server-side (ADR-0006), never read from the page.

**Blocked by:** 12.

**Status:** done

- [x] Clicking a row selects it, highlights it and the button goes to that Oferta's checkout
- [x] Default selection is Licença Perpétua, or the first existing row when the Robô has no Compra
- [x] Rows are operable by keyboard and announced as a radio group with the selected state
- [x] With JavaScript off the button buys the default Oferta
- [x] Carousel highlight, arrows and swipe still work; selecting a row never moves the track
- [x] Checked in the browser at 1280 and 390 on a Robô with three, two and one Ofertas
- [x] Typecheck and the full test suite pass

## Comments

2026-10-09 (agent): built. View-model (TDD) in `src/content/catalog-page.ts`: `defaultOffer` (Compra, else the first row), `cardPriceRows` (rows in order, exactly one `selected`, each with its own `robot` + `offer` href), `cardBuy` now starts from the default row; the key model is `nextRadioIndex` in `src/shared/radio-group.ts`. In `src/components/robot-card.astro` the rows are server-rendered as a plain list with the default row highlighted and the button on the default Oferta (the no-JS result); a small script then adds `role=radiogroup` / `radio`, `aria-checked`, roving `tabindex`, click, Space/Enter and Arrow/Home/End handling, and swaps the button's `href` for the selected row's own. Selected look is `surface-emphasis` via a `data-selected` attribute; focus ring is the existing `shadow-focus-ring` on `focus-visible`.

Checked in headless Chromium against a static `astro build` at 1280 and 390, on a Robô with three (A), two (D) and one (B) Ofertas: default selection and href, click selects/highlights and swaps the href to `offer=monthly`, ArrowUp/Down wrap, Home, roving tabindex (`-1,0,-1`), Tab leaves the group and Shift+Tab re-enters on the selected row, selection is per card, the carousel `scrollLeft` is unchanged after clicks and arrow keys on the rows, carousel highlight still follows the next arrow (1280) and a scroll (390), no console errors, no horizontal scroll. With JS disabled the button is `offer=one_time` and the default row keeps the highlight. Not tested with a real screen reader: "announced" rests on the ARIA attributes being right.

Decisions and surprises:

- The rows keep `<ul>/<li>` and get their roles from the script, so without JS they are not announced as radios that do nothing.
- Arrow keys on a row call `stopPropagation`: the carousel track listens for ArrowLeft/Right on its own `keydown` and would otherwise scroll the track while the Cliente changes the price. Rows also `preventDefault` on `mousedown` and focus with `preventScroll`, so a click on a partly visible card cannot scroll the track either.
- Arrows select as they move (standard radio behavior), not just focus.
- A mouse click shows the focus ring too (programmatic focus counts as keyboard-ish for `:focus-visible`). Owner may prefer the ring only after a key press.
- Selection is not remembered across reloads.
- Typecheck (`astro check`: 0 errors) and the 45-file suite: 41 files pass, including `catalog-page.test.ts` and `radio-group.test.ts`. The "full test suite passes" box stays open: `src/modules/billing/{webhook,buyer-fiscal-data}.test.ts`, `identity/e2e.test.ts` and `licensing/account-page.test.ts` failed, first on timeouts under load, then, rerun alone, on `pending` instead of `active` after the Appmax webhook. The working tree held uncommitted edits to `src/modules/billing/appmax-client.ts` and `payment-provider.ts` (the appmax-checkout work) that this ticket does not touch. Rerun the suite once they are committed.

2026-10-09 (agent): the open box is closed. With the appmax-checkout work committed, `astro check` reports 0 errors and the full suite passes (47 files, 529 tests, including `catalog-page.test.ts` and `radio-group.test.ts`); the earlier billing failures came from that uncommitted work, as suspected.
