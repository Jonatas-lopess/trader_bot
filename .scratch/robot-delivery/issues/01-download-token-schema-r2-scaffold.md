# 01: Download-token D1 schema + R2 binding scaffold

**What to build:** the storage layer this effort needs — nothing user-facing yet, but every
later ticket in `robot-delivery` needs it to exist first. Mirrors this repo's own precedent
(`checkout-webhooks` ticket 01, `customer-area` ticket 01): schema-and-fixtures before
behavior.

Governing docs: PLANNING.md §8 "Licensing and delivery" (link mechanics — opaque D1 token,
24–48h TTL, `used_at` column, R2-backed streaming; R2 presigned URLs were rejected), §11
"Download-link tool" (shape agreed: Worker + D1 token + R2 binding), §12 (R2 binding itself
is not a go-live gate — only the custom domain is).

**Blocked by:** None (can start immediately)

- [ ] New migration adds a `download_tokens` table: token (unique), a reference to the
      customer the link belongs to, `expires_at`, and `used_at` (nullable — telemetry only,
      per the grill: the token is reusable within its TTL, not consumed on first redemption).
- [ ] `wrangler.jsonc` gets a new R2 bucket binding for the robot binary, following the
      existing `d1_databases`/`ratelimits` placeholder-id convention (real bucket created
      against a Cloudflare account before go-live, PLANNING.md §12 — not a build blocker).
- [ ] Test fixtures: a small dummy binary object uploaded into the test R2 bucket (miniflare)
      so tickets 02 and 03 have real bytes to mint links against and stream back.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
