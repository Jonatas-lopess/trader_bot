# 06: /catalog page replaces /planos

**Blocked by:** 01

**Status:** done

**What to build:** `/catalog` route (list of Robô cards: name, short description, Compra price as the main CTA, Anual/Mensal as secondary choices, per-Oferta buy buttons) replacing `/planos`, which redirects to `/catalog`. Keep the Anual toggle mechanism, Pix steer and `annualSavingsBadge` behind their existing `launchBlocking`. Landing plan teaser becomes a catalog teaser. Remove `plans.ts`, `plan-card.astro`, `plans-toggle.astro`, `plan-teaser.astro` or rename them, and update `docs/agents/content-files.md` "Facts shared across pages". No per-Robô detail pages. Header/footer links and `dead-links.ts` updated.

Governing docs: ADR-0006, `.scratch/marketing-pages/issues/07-plans-page.md` and `08` (superseded here).

- [x] `/catalog` renders through the site shell at desktop and mobile widths
- [x] `/planos` responds with a redirect to `/catalog`
- [x] Every price/claim is typed content; `launchBlocking` inventory updated
- [x] No Plano/Starter/Pro/Enterprise string left in `src/` (grep)


## Decisions/Notes

- New `src/content/catalog-page.ts` (page copy, per-Robô card view-models, landing teaser) reads
  `catalog.ts`; `plans.ts`, `plan-teaser.ts`, `plan-card`, `plans-toggle`, `plan-teaser` removed.
- Anual/Mensal toggle dropped, not carried over: every Oferta is listed on its card (Compra as the
  main CTA, Anual/Mensal as secondary buttons), so a toggle has nothing left to switch.
  `annualSavingsBadge` and a Pix note stay `launchBlocking` on the Anual button.
- `/planos` redirects via `astro.config.mjs` `redirects` (301 in `_redirects`).
- `/conta` now shows the Robô name (`robotName`/`robotLabel`), replacing the Plano lookup that read
  `plans.ts`; ticket 07 owns the rest of the customer-area rework.
- No `dead-links.ts` change needed: nothing linked to a dead route.
- Ticket 10 leftovers: `Assinatura` wording on `/conta`, FAQ copy, `.scratch/marketing-pages`
  historical docs, README/PLANNING mentions.
