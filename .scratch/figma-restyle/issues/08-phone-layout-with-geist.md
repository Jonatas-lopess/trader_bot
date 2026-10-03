# 08: Phone layout breaks with the wider fonts

**What to build:** At 390px the landing hero headline runs into the right edge and the catalog card's annual row wraps its price. Cause: `gutter-x` is a fixed 80px on each side at every width, leaving a 230px content column on a 390px phone (it was already narrow with the system font, but Geist at the 3.5rem `text-display` size is wider and now pushes "Automação" to the viewport edge; `scrollWidth` is 392 on a 390 viewport). The gutter and the display size need a phone value.

Observed at 390 width (ticket 05, viewed):

- `/` hero: `h1` ("Automação inteligente…") at `text-display` 3.5rem reaches x=390; the word is wider than its 230px box
- `/catalog` card A: the annual button wraps `R$ 497` onto two lines, and "Economize 20%" wraps inside its pill; the prev/next arrows sit on top of the card's left/right padding
- Same 230px column squeezes the how-it-works, teaser and FAQ cards at 390 (cosmetic: they stack, nothing clips)

Fix direction (decide in the ticket): make `--layout-gutter` responsive (about 16 to 24px below `sm`, 80px from `lg`) in the tokens file, and give `text-display` a smaller phone size (`clamp` or a breakpoint). No mobile artboard exists (PLANNING.md §2), so the phone values are derived, not drawn. Check the 1280px layout does not move.

Figma node: landing `6:5`, hero `6:18` (desktop only; not re-read, quota).

**Blocked by:** None (can start immediately).

**Status:** done

- [x] At 390 width no text clips or touches the viewport edge on `/`, `/catalog`, `/login`, `/privacidade`, `/termos-de-uso`
- [ ] The annual row on a catalog card does not wrap the price at 390
- [x] At 1280 the pages look as before (gutter 80px)
- [ ] Phone sizes are tokens, not raw values in markup

## Comments

### Done, 2026-10-02

**Changed (`src/styles/global.css`, tokens first).** New tokens `--layout-gutter-phone` 20px (below `sm`), `--layout-gutter-tablet` 40px (`sm` to `lg`), `--text-display-phone` 2.25rem (+ line-height 1.15), `--card-p-sm-phone` 20px. `--layout-gutter` (80px) and `--text-display` (3.5rem) keep their values. The `gutter-x` utility now steps phone, tablet, then 80px from `lg`; `card-p-sm` steps 20px, then 32px from `sm`. `hero-section.astro`: `text-display-phone sm:text-display`. `catalog-carousel.astro`: prev/next arrows hidden below `sm` (`max-sm:hidden!`; JS toggles `inline-flex`, hence the important modifier), because at 390 the left arrow sat on the card's caption text; swipe scrolls the track natively. All phone values are derived, no mobile artboard (PLANNING.md §2).

**Verified.** Playwright, 390 wide: `scrollWidth` is 390 on `/`, `/catalog`, `/login`, `/privacidade`, `/termos-de-uso`, `/checkout/confirmacao` (no element right of the viewport outside the carousel track). Viewed `/` (hero headline fully inside, gutter 20px) and `/catalog` (annual row `R$ 497` on one line, "Economize 20%" pill intact, row height 46px) at 390, and `/catalog`, `/privacidade` at 1280 (gutter still 80px, content starts at x=80, layout as before).

**Not viewed / side effects.** `/login` and `/checkout/confirmacao` at 390 only measured, not looked at. `gutter-x` and `card-p-sm` are shared, so `/conta` (and its `license-card`) also get the phone gutter and 20px card padding below 640px; not viewed, and `/conta` source untouched. Tablet width (640 to 1023) now has a 40px gutter instead of 80px; not viewed.
