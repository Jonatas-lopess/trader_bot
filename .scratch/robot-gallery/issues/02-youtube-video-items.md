# 02: Video items from YouTube links

**What to build:** the admin pastes a YouTube link in the gallery section and it is added as a video item, shown in the admin list with its YouTube thumbnail and a remove button. A link that is not YouTube, or has no valid id, is refused with a clear message.

- Parser accepts `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` and `m.youtube.com`, with or without tracking parameters, and keeps only the 11-character id (`[A-Za-z0-9_-]`). Only the id is stored; the embed and thumbnail URLs are rebuilt from it on render, so a pasted URL is never reflected. Embeds use the privacy-enhanced host; reuse the conventions of the landing page's video section.
- Video items count toward the same 12-item cap. Removing a video deletes the row only (no object).
- Same gate order as ticket 01 (404, then 403); no file body, so no size ceiling needed beyond the normal form limit.
- Error codes (`invalid-youtube-url`, ...) worded in `src/content/admin.ts`.

**Blocked by:** 01.

**Status:** done

TDD seams: gallery module (parser table-test of accepted and rejected shapes, cap shared with images) and the add-video route gates.

- [x] Each accepted URL shape yields the same stored id; tracking parameters and extra path parts are dropped
- [x] A non-YouTube host, a lookalike host, a missing or malformed id and an empty value are refused with `invalid-youtube-url`; nothing is stored
- [x] The admin list shows the video's thumbnail and it can be removed
- [x] The 12-item cap counts images and videos together
- [x] Non-admin 404 and cross-origin 403 on the add-video action
- [x] Works with JavaScript off
- [x] Typecheck and the full test suite pass

## Comments

- Done on `track/robot-gallery`. `parseYoutubeUrl`, `addVideo`, `youtubeEmbedUrl` (`www.youtube-nocookie.com/embed/<id>`) and `youtubeThumbnailUrl` (`i.ytimg.com/vi/<id>/hqdefault.jpg`) in `src/modules/catalog/gallery.ts`; route `src/pages/admin/robos/[slug]/galeria/video.ts`; add-video form and video thumbnails in `admin-gallery.astro`.
- Hosts match exactly: `youtu.be`, `youtube.com`, `www.youtube.com`, `m.youtube.com`; http/https only, no port, no credentials. A link pasted without a scheme is accepted (the input is `type="text"` so the browser does not block it). Query parameters other than `v` and path parts after the id are dropped. `/live/` links are not accepted (not in the spec).
- The landing's video section has no embed URL set yet (`videoUrl` is empty), so there was no host convention to reuse; the gallery uses the privacy-enhanced host as the spec says.
- Browser-checked against a local build, JS on and off: add, thumbnail, lookalike refused with message, pasted link not reflected, remove.
- Typecheck clean and full suite green on the final branch state (59 files, 878 tests).
