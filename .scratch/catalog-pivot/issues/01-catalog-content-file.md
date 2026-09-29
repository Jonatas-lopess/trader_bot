# 01: Catalog content file and server-side price lookup

**Blocked by:** —

**Status:** ready-for-agent

**What to build:** `src/content/catalog.ts`, replacing `plans.ts` as the source of catalog facts. Typed `Robot` entries (slug, name, short description, strategy type, supported Corretoras, status available/coming-soon) each with up to three Ofertas (`one_time`, `annual`, `monthly`) carrying price in cents. Placeholder entries, every price and unverified claim behind `launchBlocking` (`docs/agents/content-files.md`). A pure `lookupOffer(robotId, offer)` returning a discriminated union (`found` with `amountCents`, or `unknown_robot`/`unknown_offer`) that checkout (03) uses; nothing else reads prices.

Governing docs: ADR-0006 "Server-side price", PLANNING.md §6 Price integrity.

- [ ] Types and placeholder entries; `grep -rn "launchBlocking(" src/content/catalog.ts` lists them
- [ ] `lookupOffer` unit tests: found, unknown robot, unknown offer, offer not offered for that robot
- [ ] Old `plans.ts` exports still imported elsewhere are left for tickets 06/10 to remove; this ticket only adds
- [ ] `pnpm test` and `pnpm run typecheck` pass

