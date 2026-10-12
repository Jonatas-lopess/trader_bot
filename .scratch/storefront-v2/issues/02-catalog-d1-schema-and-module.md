# 02: Catalog in D1: schema and `modules/catalog`

**What to build:** Migration (next free number) creating `robots` and `robot_offers`, and `modules/catalog/robots.ts` as the one read-side module that knows them. Nothing consumes it yet (03).

- `robots`: `slug` PK (kebab-case CHECK-free, validated in code), `name`, `short_description`, `long_description`, `strategy_type`, `market` (JSON text array, nullable), `perfil` (nullable), `supported_corretoras` (JSON text array, nullable), `status` CHECK in (`draft`,`available`,`coming-soon`,`archived`), `sort_order` INTEGER, `created_at`, `updated_at`. Mirror the fields of today's `Robot` type in `src/content/catalog.ts`; add `long_description`.
- `robot_offers`: `(robot_slug, offer)` PK, `offer` CHECK in (`one_time`,`annual`) (Mensal is on standby, ADR-0008; a later Assinatura is not a per-Robô Oferta), `price_cents` INTEGER CHECK >= 0. Offers exist only for `available` Robôs.
- Read functions: `listPublished` (status `available` and `coming-soon`, by `sort_order`), `getPublishedBySlug`, `lookupOffer(robotId, offer)` returning the same discriminated union as today's `lookupOffer` (`found` with `amountCents`, or the not-found reasons), async. Draft and archived are not found. Also `listOffersFor`.
- `scripts/seed-catalog.sql` (or `.ts`): the five placeholder Robôs from `src/content/catalog.ts` (their `monthly` prices dropped) for local dev via `wrangler d1 execute --local`; documented in README. Never a migration.
- Tests seed rows directly through a small test helper (`test/` or `modules/catalog/test-helpers.ts`), reused by 03.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

TDD seam: D1 real; each read function and each `lookupOffer` outcome, JSON array round-trip, ordering, draft/archived exclusion.

- [ ] Migration applies on a fresh D1 and passes `schema.test.ts`-style checks
- [ ] `lookupOffer` returns the price in cents for a published robot + offered offer and rejects unknown, unoffered, draft and archived
- [ ] Seed script loads the placeholders locally; production has no seed path
- [ ] Typecheck and the full test suite pass
