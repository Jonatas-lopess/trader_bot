# 06: "Saiba mais" modal on `/catalog`

**What to build:** One native `<dialog>` on `/catalog` (same pattern as `confirm-dialog.astro` and `legal-dialog.astro`: styled, `backdrop`, focus trap by the platform, Esc closes) filled on demand with the details of the Robô whose card button was pressed. No new route (ADR-0008: ADR-0006's "no per-Robô detail pages" stands).

- Content in the modal: name, long description, the info rows (Estratégia, Mercado, Perfil), the Oferta price rows (Compra, Anual) with a buy link each (`/checkout?robot=&offer=`), an "Adicionar ao carrinho" button (wired in 08), the 7-day withdrawal note, close button.
- Data: the page already renders per-Robô rows from D1 (03), so each card carries its modal payload in the HTML (a hidden `<template>` per card, or `data-*` for the short fields plus a `<template>` for the long description; choose the one that keeps the markup readable and escape-safe). A single script opens the dialog and clones the template in; no fetch, no JSON in an attribute built from unescaped admin text.
- Without JavaScript the "Saiba mais" button degrades to an anchor to the card's own anchor (`/catalog#<slug>`); the long description is not lost, record how it stays reachable (e.g. the template content inside `<details>`).
- Coming-soon Robôs open the modal without prices and without buy controls.
- Reuse the price-row and info-row building blocks of the card (extract shared markup instead of copying); radio-group behaviour of figma-restyle 13 (`shared/radio-group.ts`) can live inside the modal if the modal keeps selectable price rows.
- Accessibility: `aria-labelledby`, focus returns to the opening button on close, background not scrollable while open (check iOS Safari).
- Copy in `content/catalog-page.ts` per `docs/agents/content-files.md`.

**Blocked by:** 03.

**Status:** done

- [x] Opens from each card with that Robô's data; Esc, backdrop click and close button dismiss; focus returns
- [x] Admin-entered text is escaped (a name containing markup renders as text)
- [x] Coming-soon variant has no prices or buy controls; buy links carry only `robot` + `offer`
- [x] Works at 390 and 1280; degrades without JavaScript
- [ ] Typecheck and the full test suite pass

## Comments

- **Verified in headless Chromium** against `astro build` + `astro preview` with the local D1 seed: opens from a card with that Robô's data, Esc, backdrop click and the close button dismiss it, focus returns to the pressed button, `body` overflow is locked while open, coming-soon opens with no price rows, buy link or cart button, buy link follows the selected price row (`robot` + `offer` only). A Robô named `<img src=x onerror=alert(1)>` with a `<script>` in its long description renders as text (no `img`/`script` node in the dialog, no alert). The dialog was seen at 390 and 1280. Not verified: iOS Safari scroll lock (real device).
- **How the long description stays reachable without JavaScript:** the "Saiba mais" button is the `<summary>` of a `<details data-robot-more>` in the card; the modal body (`robot-details.astro`) is its content. Without JS the details opens inline in the card (verified with JavaScript disabled); with JS the click is intercepted and the body is cloned into the one `<dialog>` (DOM nodes, no `innerHTML`, no fetch). This replaces the ticket's "anchor to `/catalog#<slug>`" idea. Without JS the buy link points at the default Oferta only, as the price rows did in figma-restyle 13.
- Shared blocks extracted from the card: `robot-info-rows.astro`, `robot-price-rows.astro`; the radio behaviour moved to `shared/offer-rows.ts` (still using `nextRadioIndex`).
- `body:has(dialog[open])` scroll lock moved from `confirm-dialog.astro` to `global.css`, now also on `html` (iOS).
- "Adicionar ao carrinho" is in the modal markup but `hidden` until ticket 08 wires and reveals it, so it is never a dead control.
