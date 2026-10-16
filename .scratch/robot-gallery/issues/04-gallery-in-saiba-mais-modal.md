# 04: Gallery in the "Saiba mais" modal

**What to build:** a Cliente opening "Saiba mais" on `/catalog` for a published Robô sees its gallery: a strip of thumbnails and a larger preview. Clicking a thumbnail swaps the preview. A video is a poster; the YouTube iframe is created only when the Cliente presses play. A Robô with no media shows no gallery box. An admin previewing a draft on `/catalog` sees the draft's gallery as a Cliente would.

- Catalog read side returns the gallery (in order, image URLs by item id, video ids, captions) for published Robôs; drafts only when the existing admin-preview path asks for them. Archived never.
- The gallery rides inside the card's existing `<details data-robot-more>` body like the long description; the modal clones it with DOM nodes, never `innerHTML` (captions are text only). Without JavaScript the `<details>` opens inline and images are plain `<img>`.
- Thumbnails are buttons (keyboard, screen reader); captions are alt text with a fallback from `src/content/catalog-page.ts`. Images `loading="lazy"` with width and height set so layout does not jump.
- Check the actual response headers for a CSP or frame restriction and allow the media route and the YouTube embed host if one exists.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

TDD seam: catalog read side (gallery returned only for published Robôs, in order, drafts only with the admin flag). Modal behaviour checked in the browser.

- [ ] A published Robô with images and a video shows the strip and preview in the modal; thumbnails swap the preview
- [ ] No iframe or YouTube request exists until play is pressed
- [ ] A Robô with no media shows no empty gallery
- [ ] A draft's gallery shows to an admin on `/catalog` and to nobody else; archived never
- [ ] Keyboard operation and alt text work; focus return on close is unchanged
- [ ] With JavaScript off the gallery is reachable inline in the card
- [ ] Phone width does not overflow
- [ ] Typecheck and the full test suite pass
