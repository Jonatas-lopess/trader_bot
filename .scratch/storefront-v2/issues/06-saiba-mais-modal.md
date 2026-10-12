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

**Status:** ready-for-agent

- [ ] Opens from each card with that Robô's data; Esc, backdrop click and close button dismiss; focus returns
- [ ] Admin-entered text is escaped (a name containing markup renders as text)
- [ ] Coming-soon variant has no prices or buy controls; buy links carry only `robot` + `offer`
- [ ] Works at 390 and 1280; degrades without JavaScript
- [ ] Typecheck and the full test suite pass
