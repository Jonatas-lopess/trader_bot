# 05: End-to-end verification and setup checklist

**What to build:** prove the whole gallery works in a real browser against the built app, and leave the manual setup written down.

- Admin: create a Robô, add images and a video, caption, reorder, remove, rename the slug; each action also with JavaScript off.
- Public: publish the Robô, open its modal on `/catalog` anonymously; unpublish and archive it and confirm the media URLs 404 for anonymous callers.
- Limits: an oversize file and a wrong-type file are refused end to end with readable messages.
- Setup checklist for the human: create the media bucket (dashboard or Wrangler), add the binding to `wrangler.jsonc` and to the CI environments as was done for the robot-binary bucket, deploy. Flag that the code cannot do this.
- Confirm no CSP or framing header blocks the media route or the YouTube embed on the deployed site.

**Blocked by:** 01, 02, 03, 04.

**Status:** done

- [x] Admin flow walked in the browser, with and without JavaScript
- [x] Public modal checked on desktop and phone width
- [x] Unpublished and archived Robôs expose none of their media to anonymous callers
- [x] Refusal messages read correctly for oversize and wrong-type files
- [x] Setup checklist for the media bucket and CI bindings written in the ticket's Comments
- [x] Typecheck and the full test suite pass

## Comments

### What was verified (automated, local build)

Walked with Playwright/Chromium against `astro build` + `wrangler dev -c dist/server/wrangler.json` (local D1 and R2, migrations applied with `wrangler d1 migrations apply --local`, admin via `/login/dev`). Scripts were throwaway, not committed.

- Admin, JS on and off: create a Robô, upload images (thumbnails render), add a YouTube video (thumbnail, pasted link not reflected), caption (save, alt text, blank clears, 141 chars refused), move up/down, confirm-then-remove (JS on) / direct remove (JS off), rename the slug (order, captions and media route survive), no gallery on `/admin/robos/new`.
- Public, anonymous, desktop 1280 and phone 390: modal strip and preview, thumbnail swap by click and keyboard, caption as alt text and text only, image box reserved before load, no iframe and no `youtube.com`/`youtube-nocookie.com` request before play, iframe on play, no empty gallery for a Robô without media, no horizontal overflow, focus back on "Saiba mais"; JS off shows every item inline.
- Visibility: published media served with `public, max-age=31536000, immutable` and `nosniff`; after unpublish (draft) and after archive the same URL is 404 to anonymous; an admin's catalog preview shows a draft's gallery; unknown id 404.
- Limits end to end: an SVG renamed `.png` and a 5 MB + 10 B PNG are refused with their messages; an over-ceiling request (six ~5 MB files) lands on the readable 413 page with JS on and off, and stores nothing.
- Headers: no `Content-Security-Policy` or `X-Frame-Options` on `/catalog` or the media route in the local build; `dist/client/_headers` holds only the `/_astro/*` cache rule.

**Found and fixed here:** answering the oversize upload before reading its body made Chromium render a blank page (the 413 status arrived, its body was dropped while the browser was still sending). The route now decides on the declared `Content-Length` first, exactly as before, then drains (reads and discards, never parses or stores, bounded at 2x the ceiling) before answering. Route tests cover both the drain and the bound.

### Not verifiable from here

- The deployed site's headers (no deploy from this branch). Check after the first deploy: `curl -sI https://<worker>.workers.dev/catalog` and `curl -sI https://<worker>.workers.dev/media/<some id>` must show no CSP or `X-Frame-Options` that blocks `www.youtube-nocookie.com` frames or same-origin `/media/` images. If a CSP is ever added: `frame-src https://www.youtube-nocookie.com; img-src 'self' https://i.ytimg.com`.
- Whether Cloudflare's edge passes an early 413 to the browser the same way local `wrangler dev` does (the drain makes it work locally; try one oversize upload on the deployed test site).

### Setup checklist (manual, the code cannot do this)

The binding is already declared in `wrangler.jsonc` (`ROBOT_MEDIA` -> bucket `trader-bot-robot-media`). **A deploy fails until the bucket exists**, so do steps 1 and 2 before merging this branch to `main` (the CI deploy job runs on every push to `main`).

1. Create the bucket on the same Cloudflare account as `trader-bot-robot-binary`:
   - Wrangler: `pnpm exec wrangler r2 bucket create trader-bot-robot-media` (logged in with `wrangler login`, or with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set), or
   - Dashboard: R2 -> Create bucket -> name `trader-bot-robot-media`, default location, Standard storage class.
   - Leave it **private**: no public bucket URL (`r2.dev`), no custom domain. The Worker serves it (ADR-0009).
2. CI: nothing new to add. R2 bindings come from `wrangler.jsonc`, so the existing `deploy` job and the `dev` Environment's `CLOUDFLARE_API_TOKEN` work as they do for the robot-binary bucket, provided that token has R2 edit (or at least R2 read) permission on the account; the token already deploys a Worker bound to an R2 bucket, so it should. If the deploy says the bucket is not found, the bucket was created on another account.
3. Merge and deploy. The deploy job applies migration `0016_robot_gallery.sql` (`wrangler d1 migrations apply trader-bot-db --remote`) before `wrangler deploy`.
4. Smoke test on the deployed site: as an admin, upload one image to a draft Robô, open `/catalog` (admin preview) and the modal, publish, open the modal anonymously, then unpublish and check the image URL is 404 in a private window.
5. Local dev: `pnpm exec wrangler d1 migrations apply trader-bot-db --local` once; the local R2 bucket is simulated, no setup.
