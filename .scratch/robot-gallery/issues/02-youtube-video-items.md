# 02: Video items from YouTube links

**What to build:** the admin pastes a YouTube link in the gallery section and it is added as a video item, shown in the admin list with its YouTube thumbnail and a remove button. A link that is not YouTube, or has no valid id, is refused with a clear message.

- Parser accepts `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` and `m.youtube.com`, with or without tracking parameters, and keeps only the 11-character id (`[A-Za-z0-9_-]`). Only the id is stored; the embed and thumbnail URLs are rebuilt from it on render, so a pasted URL is never reflected. Embeds use the privacy-enhanced host; reuse the conventions of the landing page's video section.
- Video items count toward the same 12-item cap. Removing a video deletes the row only (no object).
- Same gate order as ticket 01 (404, then 403); no file body, so no size ceiling needed beyond the normal form limit.
- Error codes (`invalid-youtube-url`, ...) worded in `src/content/admin.ts`.

**Blocked by:** 01.

**Status:** ready-for-agent

TDD seams: gallery module (parser table-test of accepted and rejected shapes, cap shared with images) and the add-video route gates.

- [ ] Each accepted URL shape yields the same stored id; tracking parameters and extra path parts are dropped
- [ ] A non-YouTube host, a lookalike host, a missing or malformed id and an empty value are refused with `invalid-youtube-url`; nothing is stored
- [ ] The admin list shows the video's thumbnail and it can be removed
- [ ] The 12-item cap counts images and videos together
- [ ] Non-admin 404 and cross-origin 403 on the add-video action
- [ ] Works with JavaScript off
- [ ] Typecheck and the full test suite pass
