# Robô gallery: images and videos on the Robô

Status: ready-for-agent

## Problem Statement

The admin can describe a Robô only with text. The business partner has screenshots of the
Robô running, result charts and demo videos, and has nowhere to put them. A Cliente reading
"Saiba mais" on `/catalog` sees a wall of text and no proof of what the Robô looks like when
it runs.

## Solution

Each Robô gets a **gallery**: an ordered list of images and videos managed from the Robô's
edit page in the admin. The admin uploads images, pastes YouTube links for videos, adds an
optional caption (also used as alt text), reorders items and removes them. A Robô that is
published shows its gallery in the "Saiba mais" modal on `/catalog`, as a strip of
thumbnails with a larger preview; videos play through a YouTube embed.

## User Stories

1. As an admin, I want a gallery area on a Robô's edit page, so that I can attach media to that Robô without leaving the page.
2. As an admin, I want to upload an image file, so that I can show screenshots and result charts.
3. As an admin, I want to upload several images in one go, so that I do not repeat the form for each.
4. As an admin, I want to paste a YouTube link and have it added as a video, so that I can show a demo without uploading a video file.
5. As an admin, I want links in the common YouTube shapes (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`) to be accepted, so that I can paste whatever I copied.
6. As an admin, I want a link that is not YouTube, or has no video id, to be refused with a clear message, so that I do not publish a broken embed.
7. As an admin, I want a file that is not a JPEG, PNG, WebP or AVIF image to be refused with a clear message, so that I cannot upload an executable or an HTML page by accident.
8. As an admin, I want a file that is too large to be refused with a clear message stating the limit, so that I know how to fix it.
9. As an admin, I want the type of a file judged by its content, not by its name or the browser's claim, so that a renamed file cannot slip through.
10. As an admin, I want an optional caption on each item, so that visitors and screen readers know what the item shows.
11. As an admin, I want to edit a caption after the fact, so that I can fix a typo without deleting the item.
12. As an admin, I want to reorder items, so that the best image comes first.
13. As an admin, I want to remove an item, so that outdated media goes away; removing an image also deletes its stored file.
14. As an admin, I want to confirm before removing, so that a misclick does not lose an upload.
15. As an admin, I want to see each item as a thumbnail (a video by its YouTube thumbnail) in the gallery area, so that I recognise them.
16. As an admin, I want to see the number of items against the limit, so that I know when I am full.
17. As an admin, I want a cap on items per Robô, so that a modal never carries dozens of files.
18. As an admin, I want gallery changes to work on a draft Robô, so that I can prepare media before publishing.
19. As an admin, I want gallery actions to save immediately and return me to the same place on the edit page with a flash message, so that I get feedback without losing my scroll position or my unsaved form fields being a concern (the gallery has its own forms, separate from the Robô form).
20. As an admin, I want the gallery to keep working when JavaScript is off, so that the admin never depends on a script (plain multipart forms, redirect after POST).
21. As an admin, I want an archived Robô's gallery to stay intact, so that restoring the Robô restores its media.
22. As an admin, I want renaming a slug (allowed only before a purchase) not to orphan the gallery, so that media follows the Robô.
23. As a Cliente, I want to see images of the Robô in "Saiba mais", so that I can judge the product before buying.
24. As a Cliente, I want to see a video of the Robô running, so that I understand how it behaves.
25. As a Cliente, I want to click a thumbnail to enlarge it, so that I can read the details of a chart.
26. As a Cliente, I want a video to load only when I press play, so that opening the modal does not download a video player or contact YouTube on its own.
27. As a Cliente, I want the gallery to work with the keyboard and a screen reader (captions as alt text, thumbnails as buttons), so that it is usable without a mouse.
28. As a Cliente, I want a Robô without media to show no empty gallery box, so that the modal stays clean.
29. As a Cliente, I want images to load fast on a phone, so that the catalog stays light (lazy-loaded, with width and height set so the layout does not jump).
30. As a visitor, I want a Robô that is a draft or archived to expose none of its media, so that unpublished work is not reachable by guessing a URL.
31. As an admin previewing a draft on `/catalog`, I want to see its gallery as a Cliente would, so that "pré-visualizar" is the real thing.
32. As the operator, I want uploaded files kept apart from the robot binary bucket, so that nothing public can ever sit beside a licensed binary.
33. As the operator, I want a failed upload to leave no half-written state (no row without a file, no file without a row visible to anyone), so that the gallery never shows a broken image.
34. As the operator, I want media requests that miss to be a plain 404, so that probing reveals nothing.
35. As the operator, I want uploads to stay inside the Worker's free-plan limits (CPU time, memory, body size), so that a normal upload does not fail at runtime.
36. As an admin, I want a non-admin to get an empty 404 and a cross-origin request a 403 on every gallery action, so that the admin area stays closed like the rest of `/admin`.

## Implementation Decisions

- **New module in the catalog context** owns the gallery: items, ordering, captions, the
  YouTube-link parser, file validation and R2 access. It is the only code that knows the
  gallery table and the media bucket, as `catalog/robots` is for `robots`. It is a new module
  next to `admin`, not inside it, because `admin` already carries the form, price and slug rules.
- **Schema: one table, one row per item**, keyed by an id, holding the Robô slug, kind
  (`image` or `video`), position, caption (nullable), and the kind's payload: for an image the
  R2 key, content type, byte size, and pixel width/height; for a video the YouTube video id. A
  CHECK ties the payload columns to the kind. No FK, as elsewhere in this codebase; the module
  keeps `robot_slug` consistent. Migration is additive, nothing seeded.
- **Rename follows the Robô.** `updateRobot` renames `robot_offers` in the same D1 batch; the
  gallery rows follow in that same batch. R2 keys do **not** embed the slug (they use the item
  id), so a rename moves no objects. This differs from `robots/<slug>/` in the binary bucket and
  is deliberate.
- **Separate R2 bucket and binding for media.** The existing binary bucket stays private and
  untouched. A new bucket with its own binding holds images only (videos are YouTube ids, never
  files). The bucket is never public; it is read only through the Worker.
- **Public serving through a Worker route** keyed by item id, not by slug. The route looks the
  item up in D1, serves it **only when its Robô is published** (`available` or `coming-soon`);
  an admin session also gets it for `draft`, which makes the draft preview work; anything else
  is a plain 404. Responses carry the stored content type, `X-Content-Type-Options: nosniff`,
  and a long immutable cache lifetime for published Robôs (the id never maps to different
  bytes) and `private, no-store` when served to an admin for a draft. Item ids are random, so
  the URL is not guessable, but the status gate is the real control.
- **Upload path.** Admin POST, multipart, posted to the Robô's own gallery route (not the
  Robô form: a failed Robô validation must not lose a file, and an upload must not require
  saving the form). Order of checks: not admin is an empty 404, then a foreign `Origin` is 403
  (the `gateAdmin` preamble every admin route uses), then the declared `Content-Length` is
  checked against a hard ceiling **before the body is read**, with 413 / a readable error page
  for no-JS (precedent: the Encomenda body-size cap). Then per file: size, content sniffed from
  the leading bytes (magic numbers for JPEG, PNG, WebP, AVIF), dimensions read from the header.
  The browser-claimed type and the filename are ignored (never stored, never used in the key).
- **Limits** (stated, to be tuned in implementation against the Worker limits): image up to
  5 MB, at most 12 items per Robô, caption up to 140 characters, up to 5 files per request.
  The ceiling on request size follows from these. Nothing is transcoded or resized: the Worker's
  10 ms CPU budget excludes image processing, and the admin is told the limit instead.
- **No SVG.** An SVG is an XML document that can carry script; it is not accepted. Rasters only.
- **Video = YouTube id.** The parser accepts `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`,
  `/embed/` and `m.youtube.com`, with or without tracking parameters, and keeps only the
  11-character id (`[A-Za-z0-9_-]`). Anything else is rejected with an error code. The stored
  id is rebuilt into the embed URL on render, so an admin-pasted URL is never reflected. Embeds
  use the privacy-enhanced host. The thumbnail shown before play comes from YouTube's static
  thumbnail URL; the embed itself loads only when the Cliente presses play. The landing page's
  video section already embeds YouTube; the same embed host and conventions are reused.
- **Writes are atomic enough.** Add image: put the object in R2, then insert the row; if the
  insert fails, delete the object. Remove: delete the row first, then the object (a leaked
  object is invisible and harmless; a row pointing at a missing object is a broken image).
  Reorder: one D1 batch rewriting positions for the Robô's items; stale or foreign ids in the
  request are ignored or refused, never create items. The cap and position are assigned
  server-side, guarded in SQL so two concurrent uploads cannot exceed the cap.
- **Module returns codes, not copy.** Error codes (`file-too-large`, `unsupported-type`,
  `invalid-youtube-url`, `gallery-full`, `caption-too-long`, `not-found`, ...) are worded in
  `src/content/admin.ts`, like the catalog form's field errors. Flash messages use the same
  query-key lookup as the catalog admin: nothing is stored, arbitrary text is never reflected.
- **Admin UI.** A gallery section on the Robô edit page, below the form: thumbnails in order
  with caption edit, move up/move down, and remove (each a small POST form, so it works
  without JavaScript), an "add images" file input and an "add video" URL input. It is absent
  on `/admin/robos/new`: the gallery needs an existing Robô, and a new Robô is created
  first (the page says so). Styling reuses the existing admin form patterns and tokens. All
  copy lives in `src/content/admin.ts`.
- **Public UI.** The catalog read side gains the gallery per published Robô (items in order,
  image URLs by item id, video ids). The card carries the gallery inside its existing
  `<details data-robot-more>` body like the long description, and the existing modal clones it
  with DOM nodes (no `innerHTML`, captions are text only). Without JavaScript the `<details>`
  opens inline and the images are plain `<img>` elements. Thumbnails are buttons that swap the
  large preview; a video preview is a poster that swaps in the iframe on press. Images are
  `loading="lazy"` with width and height. Copy for the gallery (labels, alt fallback) goes in
  `src/content/catalog-page.ts`.
- **Content Security Policy / framing.** If the site sends a CSP or frame restrictions, the
  YouTube embed host and the media route must be allowed; verify against the actual response
  headers when implementing (none were found in a quick scan).
- **Removing a Robô's media on archive: no.** Archiving keeps rows and files, since archive is
  reversible (ADR-0008). Hard deletes of Robôs do not exist.
- **ADR.** Records the one new architectural choice (separate media bucket, Worker-served,
  status-gated). Does not contradict ADR-0008, which keeps the binary and source in R2 out of
  the admin; the gallery is a different bucket and a different purpose. PLANNING.md §3's
  "Object storage" row and the "admin upload of the robot binary to R2" out-of-scope line at §1
  get a note that image upload of gallery media is in scope and binary upload still is not.

## Testing Decisions

- A good test drives external behavior only: what the admin submits and what gets stored or
  served, not how the module is split. Real Workers runtime, real D1 and real R2 bindings, the
  harness already used by the catalog and licensing suites; no hand-rolled fakes of storage.
- **Seam 1, the gallery module** (highest seam for the rules): add an image (valid JPEG, PNG,
  WebP, AVIF; a file lying about its type; an SVG; an oversize file; a truncated header), add
  a video from each accepted URL shape and from rejected ones, cap enforcement including two
  concurrent adds, caption validation, reorder (valid, foreign ids, partial list), remove
  (row and object gone, a missing object still lets the row be removed), rename follows the
  Robô, a failed insert leaves no object. Small fixture images are generated in the test, not
  committed as binaries where a few bytes suffice.
- **Seam 2, the routes** (user asked for page level): the admin gallery POST routes and the
  media route. Non-admin gets an empty 404 and a cross-origin admin POST gets 403, on every
  action; an over-ceiling `Content-Length` is refused before the body is read; the media
  route serves a published Robô's image with the stored type, `nosniff` and cache headers,
  404s for a draft or archived Robô to an anonymous caller, serves a draft to an admin with
  `no-store`, and 404s for an unknown id and for a row whose object is missing.
- **Public rendering** is checked in the browser (modal, keyboard, no-JS `<details>`,
  video-on-press) and by a test that the catalog read side returns the gallery only for
  published Robôs and in order. A draft shows its gallery only to an admin on `/catalog`.
- Prior art: `modules/catalog/admin.test.ts` (validation codes, slug rules, D1 batches),
  `modules/catalog/robots.test.ts` (published vs draft visibility),
  `modules/licensing/robot-binary.test.ts` and `test/seed-r2-fixture.ts` (R2 in tests),
  `modules/identity/admin.test.ts` (the 404/403 gate), and the Encomenda body-size-cap tests
  (the pre-read size ceiling).
- Typecheck and the full suite pass; the migration applies via the existing test setup.

## Out of Scope

- Uploading video files. Videos are YouTube links only; self-hosted video (R2 Range
  streaming, size caps, transcoding) is a separate decision if YouTube proves unsuitable.
- Vimeo or any non-YouTube link.
- Resizing, cropping, thumbnails generation or format conversion of uploads (Cloudflare Images
  is not in the stack, PLANNING §3).
- Drag-and-drop reordering and upload progress bars (JavaScript enhancements, not required;
  move up/down and plain forms are the baseline).
- A site-wide media library shared across Robôs.
- Gallery on any page other than the "Saiba mais" modal (no per-Robô route, ADR-0006 stands),
  the landing page, or the customer area.
- Uploading or managing the robot binary and source in the admin (ADR-0008 keeps it manual).
- Image alt-text generation, moderation, or virus scanning beyond type sniffing.
- Cleaning up orphaned R2 objects left by a crash between steps (the order of operations makes
  them invisible; a sweep job is a later option, like the dead-letter cron).

## Further Notes

- Domain vocabulary: the public is a **Cliente**, the product is a **Robô**, the catalog is
  the **Catálogo**. "Galeria" is user-facing copy only and needs no glossary entry unless it
  starts to carry rules beyond "media of one Robô"; if a term is wanted, add it to `CONTEXT.md`
  under Product.
- Launch copy: any gallery text that is not approved for launch uses the existing
  `launchBlocking` marker (`docs/agents/content-files.md`). Real media is the partner's, and
  nothing is seeded; `scripts/seed-catalog.sql` may gain placeholder rows for local dev only,
  never a migration.
- Cloudflare setup is a manual step the implementer cannot do from code: creating the media
  bucket in the dashboard or with Wrangler and adding the binding to `wrangler.jsonc`
  (and the CI environments, as was done for the existing bucket). Flag it in the final report.
- Free-plan note: the media route counts against the 100k/day request quota. Immutable cache
  headers keep repeat views off the Worker; if that is not enough, serving from a custom
  domain bucket with the CDN cache is the escape hatch, at the price of making the bucket
  public, which is why it is not the default.
