# 01: Astro + Cloudflare Workers scaffold

**What to build:** A running site skeleton. `npm run dev` serves a prerendered placeholder page, and `wrangler dev` serves the same page from a Worker with Static Assets. This is the prefactor every other ticket stands on: nothing here is user-visible, but no page can be built until it exists.

Astro with `@astrojs/cloudflare`, deployed as a Worker with Static Assets — not Cloudflare Pages (ADR-0002). SSR needs the `nodejs_compat` and `global_fetch_strictly_public` compatibility flags. Vitest is wired up but has nothing to cover yet. CI runs install, typecheck and build on push.

No deploy step. Deployment is blocked on an external prerequisite that does not exist yet: a registered domain on a Cloudflare zone (PLANNING.md §12). CI builds, it does not ship.

Code conventions from PLANNING.md §5 apply from the first file: functional, no classes, kebab-case filenames, camelCase values, PascalCase types, `type` over `interface`.

**Blocked by:** None (can start immediately).

**Status:** done

- [ ] Astro project builds with `@astrojs/cloudflare`, marketing routes prerendered
- [ ] `wrangler.jsonc` configures Static Assets and both compatibility flags
- [ ] Module folders from PLANNING.md §4 exist (`pages/`, `components/`, `modules/billing|identity|licensing`, `shared/`), empty is fine
- [ ] `wrangler dev` serves the placeholder page locally
- [ ] Vitest runs and passes with zero or trivial tests
- [ ] GitHub Actions workflow runs install, typecheck, build — no deploy job
