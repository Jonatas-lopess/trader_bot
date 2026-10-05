# 15: Catalog `market` field, optional Corretoras, catalog guard tests

**Blocked by:** —

**Status:** done

**What to build:** add where a Robô operates to the catalog, make the two informational card rows optional, and pin the catalog's naming and length rules with tests. Origin: grilling session 2026-10-05 on what a Robô record carries. Content only: no D1 migration, no ADR.

- **`market`.** New `market?: LaunchBlocking<string[]>` on `Robot` (`src/content/catalog.ts`). Free labels ("Mini Índice", "Mini Dólar"), no enum: nothing filters by it and a closed set before a real Robô exists is premature. Not the MT5 symbol (it changes with the contract expiry), not the timeframe. Claim copy, so `launchBlocking` with the same `placeholderClaim` reason.
- **`supportedCorretoras` becomes optional.** Only the `/catalog` card reads it (`catalog-page.ts`, `robot-card.astro`); no licensing, checkout or compile code depends on it.
- **Card.** `CatalogCard` gains `market: string[]`, and both `market` and `corretoras` are empty when absent. `robot-card.astro` renders a "Mercado" row (label in `catalog-page.ts`, next to `strategyTypeLabel`) between "Estratégia" and "Corretoras compatíveis". A row is omitted when its list is absent or empty: no dash, no "a definir". Catalog card only; not the landing teaser, not the `/conta` license card.
- **Unchanged and required:** `name`, `shortDescription`, `strategyType` (empty fields leave a hole in the first thing a buyer compares). The price is the existing Ofertas; no new value field.
- **Placeholders.** `robo-exemplo-a` and `-b` fill both `market` and `supportedCorretoras`; `robo-exemplo-c` ("Em breve") fills neither, which covers the absent case.
- **Guard tests** (`catalog.test.ts`):
  - `slug` matches kebab-case and is unique. It is frozen after the first Compra: it is in `/checkout?robot=`, `robots/<slug>/` in R2 and `purchases.robot_id`. State this in the comment on `Robot.slug`.
  - `name` is unique after stripping accents and case, so two near-identical Robôs cannot share a card list.
  - `shortDescription` is at most 140 characters.

**Deferred, not in this ticket:**

- **Banner image.** Optional per Robô; a Robô without one renders as today. The `banner` field is not added yet because the storage and delivery of the images is undecided, so its `src` shape is unknown and an unrendered field would be dead code. Rules already decided, for when it lands: 16:9, `alt` required when an image exists, shown on the `/catalog` card and the teaser (not `/conta`), never a profit or performance chart (CDC art. 37). Recorded in `.scratch/backlog.md`.
- **Long description.** Waits for per-Robô detail pages, which ADR-0006 defers until a second real Robô exists.

**Dropped:** "capital mínimo recomendado". It is a risk claim close to the investment recommendation `regulatoryNote` disclaims.

Governing docs: ADR-0006 ("Catalog data is a typed content file"), `docs/agents/content-files.md`, CONTEXT.md (Robô, Catálogo).

- [x] `Robot.market` and optional `supportedCorretoras` in `catalog.ts`; the placeholders as above
- [x] `CatalogCard.market`; "Mercado" label in `catalog-page.ts`
- [x] `robot-card.astro` renders a row only when its list is non-empty; a card test covers `robo-exemplo-c` (neither row) and `-a` (both rows)
- [x] Guard tests: slug format and uniqueness, name uniqueness without accents or case, `shortDescription` ≤ 140
- [x] `pnpm test` and `pnpm run typecheck` pass
