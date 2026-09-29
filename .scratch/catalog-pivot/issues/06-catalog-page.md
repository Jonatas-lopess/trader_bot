# 06: /catalog page replaces /planos

**Blocked by:** 01

**Status:** ready-for-agent

**What to build:** `/catalog` route (list of Robô cards: name, short description, Compra price as the main CTA, Anual/Mensal as secondary choices, per-Oferta buy buttons) replacing `/planos`, which redirects to `/catalog`. Keep the Anual toggle mechanism, Pix steer and `annualSavingsBadge` behind their existing `launchBlocking`. Landing plan teaser becomes a catalog teaser. Remove `plans.ts`, `plan-card.astro`, `plans-toggle.astro`, `plan-teaser.astro` or rename them, and update `docs/agents/content-files.md` "Facts shared across pages". No per-Robô detail pages. Header/footer links and `dead-links.ts` updated.

Governing docs: ADR-0006, `.scratch/marketing-pages/issues/07-plans-page.md` and `08` (superseded here).

- [ ] `/catalog` renders through the site shell at desktop and mobile widths
- [ ] `/planos` responds with a redirect to `/catalog`
- [ ] Every price/claim is typed content; `launchBlocking` inventory updated
- [ ] No Plano/Starter/Pro/Enterprise string left in `src/` (grep)

