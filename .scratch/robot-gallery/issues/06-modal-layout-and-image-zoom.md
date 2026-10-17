# 06: Modal row layout, standard gallery viewport and full-size image view

**What to build:** the "Saiba mais" modal on `/catalog` shows the gallery and the Robô's details side by side, stacking to one column on narrow widths. Every gallery item sits in the same 16:9 viewport, whatever its own proportions. Pressing an image opens it at full size. The embedded YouTube player is trimmed to the video itself.

**Blocked by:** 04.

**Status:** done

- Layout: the dialog is wider; the body is a container and the details switch between row and column by the container's width (not the viewport's), so the card's no-JS inline `<details>` stays a column. A Robô without a gallery stays a single column.
- Viewport: images are letterboxed (`object-contain`) inside 16:9 instead of a free height capped at `60dvh`.
- Zoom: the image is a link to the original (new tab without JavaScript); with JavaScript it opens a second native `<dialog>` over the modal. Escape, a click or the close button dismiss only that one. Labels live in `src/content/catalog-page.ts`.
- Player: the embed loses annotations, auto-captions and the control-bar logo, and plays inline on phones; related videos stay within the channel. YouTube's own title bar and "watch on" link cannot be removed from an embed.

- [x] With a gallery, details sit beside it from the container's `2xl` width up and stack below it
- [x] Landscape, portrait and video items fill the same viewport without cropping or layout jump
- [x] Pressing an image shows it full size; Escape, click or × closes it and the modal stays open
- [x] With JavaScript off the image link opens the original in a new tab
- [x] Typecheck and `catalog-page` tests pass
- [ ] Checked in the browser at desktop and phone width (not done: no visual check yet)

## Comments

- Open question: the buy and cart buttons still switch to a row at the viewport's `sm`, so in the narrower details column they may be tight; the fix is a container query (`@lg:`).
- Open question: `controls=0` on the player would hide the whole control bar; left off because the Cliente would lose pause, seek and volume.
- The zoom dialog's `alt` falls back to the link's `aria-label` because the thumbnail `alt` is empty (the link carries the name).
