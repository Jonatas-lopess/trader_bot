# 10: Wordmark and prices use `text-heading-*` but render in the body font

**What to build:** Ticket 03 applies the heading family (Geist) through an `h1`-`h6` selector in the base layer. Elements that take a `text-heading-*` size but are not heading tags therefore render in Manrope, so the same size looks like a different typeface depending on the tag:

- `src/components/site-header.astro`: the brand link (`<a class="text-heading-3 font-bold">`)
- `src/components/site-footer.astro`: the brand name (`<p class="text-heading-3 font-bold">`)
- `src/components/robot-card.astro` and `src/components/catalog-teaser.astro`: the prices (`<span class="text-heading-2 font-bold">`, "R$ 997")

Viewed at 1280: the wordmark and prices are visibly Manrope next to Geist headings.

Whether Figma draws the wordmark and prices in Geist is **not verified** (Figma quota exhausted; this belongs with ticket 06's reads). Default if the owner has no objection: they are display text, so Geist. Fix direction: add `font-heading` (the `--font-heading` token is already a theme utility) on those four elements, or give `text-heading-*` the family in the tokens file so every consumer follows. The second also changes `/conta` text; coordinate with ticket 04.

Figma node: landing `6:5` header and footer, plan cards.

**Blocked by:** None (can start immediately); confirm against Figma when 06 is done.

**Status:** done

- [x] The wordmark and prices render in the heading family, or the owner confirms Figma uses Manrope there
- [ ] No other element with a `text-heading-*` class renders in a different family than the headings
- [x] Typecheck and the full test suite pass

## Comments

### Implemented, 2026-10-02 (status left open: test suite not run by me)

**Changed.** Added `font-heading` (existing `--font-heading` theme utility, no token or CSS change) to the four non-heading `text-heading-*` elements: header brand link, footer brand name, robot-card price, catalog-teaser price. Default taken: Geist (display text); not confirmed against Figma (ticket 06 still open). All other `text-heading-*` uses in `src/` (grep, excluding `/dev/tokens`) are on `h1`-`h3` and already Geist. `/conta` untouched.

**Verified.** `pnpm typecheck` 0 errors, `pnpm build` ok. Viewed at 1280 and 390: wordmark (header and footer) and "R$ 997" now match the heading face. Box 3 (full test suite) is for the orchestrator to run; tick it and set done after.
