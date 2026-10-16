# Robô gallery media: a separate private bucket, served by the Worker, gated on status

Status: Accepted (2026-10-16), with the robot-gallery effort (`.scratch/robot-gallery/`).
Does **not** contradict [ADR-0008](0008-catalog-in-d1-cart-and-admin.md): the robot binary and
source stay out of the admin; this is a different bucket for a different purpose.

## Context

The admin can describe a Robô only with text. The business partner has screenshots, result
charts and demo videos to show in the "Saiba mais" modal on `/catalog`. Images have to be stored
somewhere, uploaded from the admin, and shown to visitors only while the Robô is published.
The existing R2 bucket (`ROBOT_BINARY`) holds licensed per-Licença binaries and the Robôs'
source; it must never hold anything public or anything an admin form can write.

## Decision

**A second R2 bucket with its own binding, `ROBOT_MEDIA`, holds gallery images only.** Videos
are YouTube ids in D1, never files. Object keys are `gallery/<item id>`, never the Robô slug, so a
slug rename (allowed before any purchase) moves rows in D1 and no objects.

**The bucket is never public; the Worker serves it** at `GET /media/<item id>`. The route looks
the item up in D1 and serves it only while its Robô is published (`available`, `coming-soon`),
with a long `immutable` cache lifetime (an id never maps to other bytes). An admin session also
gets a `draft` or `archived` Robô's images (the catalog preview of a draft, the edit page's
thumbnails), with `private, no-store`. Anything else is a plain 404. Item ids are random, but the
status gate is the real control. Responses carry the content type sniffed at upload and
`X-Content-Type-Options: nosniff`.

**Uploads are judged by their bytes.** The admin route checks the declared `Content-Length`
against a hard ceiling before reading the body; the module then sniffs each file's magic number
(JPEG, PNG, WebP, AVIF only; no SVG, which is a document that can carry script) and reads the
pixel size from the header. The filename and the browser's claimed type are never stored or
used. Nothing is resized or transcoded: the 10 ms CPU budget (PLANNING §3) rules it out, and
Cloudflare Images is not in the stack, so the admin is told the limits instead (5 MB per image,
5 files per request, 12 items per Robô).

## Consequences

- One more resource to create by hand per Cloudflare account (`wrangler r2 bucket create
  trader-bot-robot-media`) before a deploy that carries the binding can succeed; the binding is
  declared in `wrangler.jsonc` like `ROBOT_BINARY`.
- Every gallery image view is a Worker request against the 100k/day free quota. Immutable cache
  headers keep repeat views in the browser. If that is not enough, serving from a custom-domain
  bucket behind the CDN cache is the escape hatch, at the price of making the bucket public,
  which is why it is not the default.
- Archiving a Robô keeps its gallery rows and files (archive is reversible, ADR-0008). Removing
  an item deletes the row first, then the object; a crash in between leaks an invisible object,
  never a broken image. No sweep job yet.
