# 08: Phone layout breaks with the wider fonts

**What to build:** At 390px the landing hero headline runs into the right edge and the catalog card's annual row wraps its price. Cause: `gutter-x` is a fixed 80px on each side at every width, leaving a 230px content column on a 390px phone (it was already narrow with the system font, but Geist at the 3.5rem `text-display` size is wider and now pushes "Automação" to the viewport edge; `scrollWidth` is 392 on a 390 viewport). The gutter and the display size need a phone value.

Observed at 390 width (ticket 05, viewed):

- `/` hero: `h1` ("Automação inteligente…") at `text-display` 3.5rem reaches x=390; the word is wider than its 230px box
- `/catalog` card A: the annual button wraps `R$ 497` onto two lines, and "Economize 20%" wraps inside its pill; the prev/next arrows sit on top of the card's left/right padding
- Same 230px column squeezes the how-it-works, teaser and FAQ cards at 390 (cosmetic: they stack, nothing clips)

Fix direction (decide in the ticket): make `--layout-gutter` responsive (about 16 to 24px below `sm`, 80px from `lg`) in the tokens file, and give `text-display` a smaller phone size (`clamp` or a breakpoint). No mobile artboard exists (PLANNING.md §2), so the phone values are derived, not drawn. Check the 1280px layout does not move.

Figma node: landing `6:5`, hero `6:18` (desktop only; not re-read, quota).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] At 390 width no text clips or touches the viewport edge on `/`, `/catalog`, `/login`, `/privacidade`, `/termos-de-uso`
- [ ] The annual row on a catalog card does not wrap the price at 390
- [ ] At 1280 the pages look as before (gutter 80px)
- [ ] Phone sizes are tokens, not raw values in markup

## Comments
