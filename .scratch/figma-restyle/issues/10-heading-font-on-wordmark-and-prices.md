# 10: Wordmark and prices use `text-heading-*` but render in the body font

**What to build:** Ticket 03 applies the heading family (Geist) through an `h1`-`h6` selector in the base layer. Elements that take a `text-heading-*` size but are not heading tags therefore render in Manrope, so the same size looks like a different typeface depending on the tag:

- `src/components/site-header.astro`: the brand link (`<a class="text-heading-3 font-bold">`)
- `src/components/site-footer.astro`: the brand name (`<p class="text-heading-3 font-bold">`)
- `src/components/robot-card.astro` and `src/components/catalog-teaser.astro`: the prices (`<span class="text-heading-2 font-bold">`, "R$ 997")

Viewed at 1280: the wordmark and prices are visibly Manrope next to Geist headings.

Whether Figma draws the wordmark and prices in Geist is **not verified** (Figma quota exhausted; this belongs with ticket 06's reads). Default if the owner has no objection: they are display text, so Geist. Fix direction: add `font-heading` (the `--font-heading` token is already a theme utility) on those four elements, or give `text-heading-*` the family in the tokens file so every consumer follows. The second also changes `/conta` text; coordinate with ticket 04.

Figma node: landing `6:5` header and footer, plan cards.

**Blocked by:** None (can start immediately); confirm against Figma when 06 is done.

**Status:** ready-for-agent

- [ ] The wordmark and prices render in the heading family, or the owner confirms Figma uses Manrope there
- [ ] No other element with a `text-heading-*` class renders in a different family than the headings
- [ ] Typecheck and the full test suite pass

## Comments
