# 07: Compact catalog cards in a grid

**What to build:** Replace the carousel on `/catalog` with a responsive grid (1 column phone, 2 tablet, 3 desktop) of slimmer cards. Delete `catalog-carousel.astro` and its script, and the `data-active`/centre-highlight styling in `robot-card.astro`.

- Card keeps: name, quiet short description, the main price (Compra, falling back to the lowest Oferta shown with its label), and two actions: "Saiba mais" (opens the modal of 06) and "Adicionar ao carrinho" (button, wired in 08).
- The details block (check rows) and the selectable price-row radio group (figma-restyle 13) move to the "Saiba mais" modal (06); the card no longer carries them. Remove the now-dead radio-group script paths only if nothing else uses `shared/radio-group.ts`; otherwise keep it for the modal.
- Coming-soon cards: badge, no price, no buttons beyond "Saiba mais".
- Re-check the Figma frame decisions: figma-restyle 12 made the card 1:1 with `ipa2`; this is an owner-approved departure (2026-10-12). Note it in that ticket's Comments.

**Blocked by:** 03, 06.

**Status:** done

- [x] Grid at 390, 768 and 1280; cards equal height, buttons aligned
- [x] "Saiba mais" opens the modal; the coming-soon variant is correct
- [x] Carousel and its script removed; no unused code left
- [x] Typecheck and the full test suite pass

## Comments

- Viewed in headless Chromium (`astro build` + `astro preview`, local D1 seed) at 1280 (3 columns), 768 (`sm:` breakpoint gives 2 columns; `scrollWidth` equals `clientWidth`, the 768 screenshot itself was not inspected) and 390 (1 column). Cards are equal height with the price and "Saiba mais" pinned to the bottom (`mt-auto`). The coming-soon card shows the badge and "Saiba mais" only. "Adicionar ao carrinho" is on the card but `hidden` until ticket 08 reveals it, so "buttons aligned" is checked for the one visible button only.
- The card is the `<details>` host of ticket 06: "Saiba mais" is its `<summary>`.
- `catalog-carousel.astro` deleted; carousel copy exports replaced by `catalogListLabel`. `shared/radio-group.ts` is kept (the modal's price rows use it through `shared/offer-rows.ts`). Added `cardMainPrice` (Compra, else the lowest Oferta, shown with its label).
- Figma departure noted in `.scratch/figma-restyle/issues/12-robot-card-1to1-from-ipa2.md`.
