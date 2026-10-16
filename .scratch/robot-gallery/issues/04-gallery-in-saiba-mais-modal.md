# 04: Gallery in the "Saiba mais" modal

**What to build:** a Cliente opening "Saiba mais" on `/catalog` for a published Robô sees its gallery: a strip of thumbnails and a larger preview. Clicking a thumbnail swaps the preview. A video is a poster; the YouTube iframe is created only when the Cliente presses play. A Robô with no media shows no gallery box. An admin previewing a draft on `/catalog` sees the draft's gallery as a Cliente would.

- Catalog read side returns the gallery (in order, image URLs by item id, video ids, captions) for published Robôs; drafts only when the existing admin-preview path asks for them. Archived never.
- The gallery rides inside the card's existing `<details data-robot-more>` body like the long description; the modal clones it with DOM nodes, never `innerHTML` (captions are text only). Without JavaScript the `<details>` opens inline and images are plain `<img>`.
- Thumbnails are buttons (keyboard, screen reader); captions are alt text with a fallback from `src/content/catalog-page.ts`. Images `loading="lazy"` with width and height set so layout does not jump.
- Check the actual response headers for a CSP or frame restriction and allow the media route and the YouTube embed host if one exists.

**Blocked by:** 01, 02.

**Status:** done

TDD seam: catalog read side (gallery returned only for published Robôs, in order, drafts only with the admin flag). Modal behaviour checked in the browser.

- [x] A published Robô with images and a video shows the strip and preview in the modal; thumbnails swap the preview
- [x] No iframe or YouTube request exists until play is pressed
- [x] A Robô with no media shows no empty gallery
- [x] A draft's gallery shows to an admin on `/catalog` and to nobody else; archived never
- [x] Keyboard operation and alt text work; focus return on close is unchanged
- [x] With JavaScript off the gallery is reachable inline in the card
- [x] Phone width does not overflow
- [x] Typecheck and the full test suite pass

## Comments

- Done on `track/robot-gallery`. Read side `listPublishedGalleries(env, { includeDrafts })` in `src/modules/catalog/gallery.ts` (published only, drafts with the admin flag, archived never); `/catalog` loads it next to `listPublishedWithOffers` with the same flag, and `buildCatalogCards(robots, galleries)` maps it to `CatalogCard.gallery` (`src/content/catalog-page.ts`, which also holds the alt fallback and labels). `listPublishedWithOffers` is unchanged, so `POST /cart/summary` pays no extra D1 read.
- Markup `src/components/robot-gallery.astro` inside `robot-details.astro`; behaviour `src/shared/gallery-viewer.ts`, called by `robot-dialog.astro` on the cloned body. Switching away from a playing video puts its poster back (drops the iframe, stops the sound); closing the dialog empties it as before.
- CSP and framing: checked the real responses of a local build and `dist/client/_headers` (only the `/_astro/*` cache rule). No `Content-Security-Policy` or `X-Frame-Options` is sent, so nothing needs allowing today. If one is added later, it must allow `frame-src https://www.youtube-nocookie.com` and `img-src https://i.ytimg.com 'self'`.
- **Reviewer note (spec tension):** the spec's decision says the pre-play thumbnail comes from YouTube's static thumbnail URL, so opening the modal loads `i.ytimg.com/vi/<id>/hqdefault.jpg` (with `referrerpolicy="no-referrer"`). No `youtube.com` / `youtube-nocookie.com` request and no iframe happen before play (browser-checked), but `i.ytimg.com` is a Google host. If "no YouTube request" in user story 26 is meant to include the thumbnail CDN, the poster needs a local placeholder instead; that is an owner call, not changed here.
- Browser-checked against a local build (anonymous, desktop 1280 and phone 390): strip and preview, thumbnail swap by click and by keyboard, caption as alt text and as text only, image box reserved before load (`w-full h-auto` + width/height), iframe only after play, no empty gallery box, no horizontal overflow, focus back on "Saiba mais" on close; admin preview shows a draft's gallery, anonymous gets 404 for its media; after archiving it is gone from the preview and its media is 404; with JavaScript off every item shows inline in the card and the video poster links to the YouTube page.
- Typecheck clean and full suite green on the final branch state (59 files, 878 tests).
