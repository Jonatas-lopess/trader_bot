# 03: Switch the site and checkout to the D1 catalog

**What to build:** Replace every reader of `src/content/catalog.ts` with `modules/catalog` and delete the file.

- `checkout.ts` (and appmax-checkout's `resolveCheckout`/`pay` as they land) call the async `lookupOffer`.
- `content/catalog-page.ts` keeps the copy (headings, labels, regulatory note, `cardBuy`, price-row labels) but takes Robôs as input instead of importing them; `catalogCards`/`teaserCards` become functions of the rows. Format cents to BRL in one place.
- `catalog.astro` becomes `prerender = false` and loads rows; `RobotCard` receives a card built from a row. The landing teaser: decide static (build-time read is impossible against D1, so either SSR the landing or drop prices/robots from the teaser) and record the decision in this ticket's Comments; prefer keeping `/` prerendered if the teaser can be a plain link band.
- Remove `launchBlocking` wrapping of catalog data; the `launchBlocking` rule for catalog copy becomes the `draft` status. Update `docs/agents/content-files.md` accordingly and the `launch-blocking` grep note.
- Port `catalog.test.ts`, `catalog-page.test.ts`, `checkout.test.ts`, `catalog-e2e.test.ts` and any fixture to D1 seeding.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] No import of `content/catalog.ts` remains; file deleted
- [ ] `/catalog` renders from D1; a draft Robô is absent; an empty catalog renders an explicit empty state (copy in a content file)
- [ ] Checkout rejects draft/archived/unknown Robôs and prices from D1
- [ ] Landing decision recorded; no regression in the prerendered pages that stay static
- [ ] `content-files.md` and PLANNING §2/§6 wording reconciled
- [ ] Typecheck and the full test suite pass
