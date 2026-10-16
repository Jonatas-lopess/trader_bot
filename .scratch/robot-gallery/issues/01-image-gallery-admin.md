# 01: Image gallery in the admin: upload, list, remove

**What to build:** on a Robô's edit page the admin sees a gallery section. They upload one or more images, see them as thumbnails in order, and remove one (the stored file goes with it). The section is absent on the create page, which says to create the Robô first. Works with JavaScript off (plain multipart forms, redirect after POST with a flash).

This is the tracer bullet: it carries the schema (one table, one row per item, kind-checked payload), a new private media bucket and binding apart from the robot-binary bucket, the gallery module, the admin routes and the status-gated media route that serves the thumbnails. Videos, captions and reorder come in later tickets, but the table and module shape must already fit them (kind `image | video`, position, nullable caption).

- Module rules: content sniffed from leading bytes (JPEG, PNG, WebP, AVIF), the browser-claimed type and filename ignored; dimensions read from the header; no SVG; 5 MB per image, 12 items per Robô (cap enforced in SQL so two concurrent uploads cannot exceed it), up to 5 files per request. Add = put object then insert row, delete the object if the insert fails. Remove = delete row first, then object; a missing object still lets the row go. R2 keys use the item id, never the slug.
- Request order on every gallery POST: not admin is an empty 404, then foreign `Origin` is 403, then the declared `Content-Length` is checked against a hard ceiling before the body is read (readable error page without JS).
- Media route keyed by item id: serves only when the Robô is `available` or `coming-soon`; an admin session also gets a `draft`; anything else, an unknown id, or a row whose object is missing is a plain 404. Stored content type, `nosniff`, immutable cache for published, `private, no-store` for the admin draft case.
- Module returns error codes; the wording lives in `src/content/admin.ts` (see `docs/agents/content-files.md`). Flash via the query-key lookup used by the catalog admin.
- Record the one architectural choice (separate media bucket, Worker-served, status-gated) as an ADR that does not contradict ADR-0008, and add the PLANNING §1/§3 notes (gallery image upload in scope, binary upload still out).

**Blocked by:** None (can start immediately).

**Status:** done

TDD seams: the gallery module (against real D1 and R2 test bindings, small generated fixture images) and the routes (404, 403, size ceiling before body read, media-route gating). Prior art: `catalog/admin.test.ts`, `catalog/robots.test.ts`, `licensing/robot-binary.test.ts`, `identity/admin.test.ts`, the Encomenda body-size-cap tests.

- [x] Admin uploads valid JPEG, PNG, WebP and AVIF images and sees them as thumbnails on the edit page
- [x] A file lying about its type, an SVG, an oversize file, a truncated header and a non-image are refused with a clear code and message; nothing is stored
- [x] The 13th item is refused (`gallery-full`), including under two concurrent uploads
- [x] Removing an item deletes the row and the R2 object; a missing object does not block removal
- [x] A failed insert leaves no R2 object
- [x] Non-admin gets an empty 404 and a cross-origin admin POST gets 403 on every gallery action; an over-ceiling `Content-Length` is refused before the body is read
- [x] Media route: published Robô served with stored type, `nosniff`, immutable cache; draft and archived are 404 to anonymous; draft served `no-store` to an admin; unknown id and missing object are 404
- [x] The gallery section is absent on `/admin/robos/new`
- [x] Works with JavaScript off
- [x] ADR and PLANNING notes written
- [x] Typecheck and the full test suite pass

## Comments

- Done on `track/robot-gallery`. Migration `0016_robot_gallery.sql`; module `src/modules/catalog/gallery.ts`; routes `src/pages/admin/robos/[slug]/galeria/imagens.ts`, `.../galeria/[id]/remover.ts`, `src/pages/media/[id].ts`; UI `src/components/admin-gallery.astro`; ADR-0009. Binding `ROBOT_MEDIA` (bucket `trader-bot-robot-media`) declared in `wrangler.jsonc`; the bucket itself is a manual step (ticket 05).
- Upload ceiling: `MAX_UPLOAD_REQUEST_BYTES` = 5 files x 5 MB + 64 KB. A missing `Content-Length` is 411; over the ceiling is a 413 HTML page with a link back. The refusal is decided on the declared length before the body is touched; since ticket 05 the body is then drained (discarded, never parsed or stored, bounded at 2x the ceiling) before answering, because Chromium shows a blank page when the answer arrives mid-upload.
- One deviation from the spec's wording: the media route also serves an **archived** Robô's images to an admin (private, no-store), so the thumbnails on an archived Robô's edit page are not broken. Anonymous callers still get 404 for draft and archived, as the acceptance criterion says.
- Browser-checked against a local build (`wrangler dev` on `dist/server`), JS on and off: upload, thumbnails, SVG and oversize refusals, confirm-then-remove, no gallery on `/admin/robos/new`. WebP and AVIF are proven by the module tests (header fixtures), not by real files in the browser.
- Typecheck clean and full suite green on the final branch state (59 files, 878 tests).
