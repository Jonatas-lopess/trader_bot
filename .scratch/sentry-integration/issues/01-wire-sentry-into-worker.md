# 01: Wire Sentry into the Worker

**What to build:** any unhandled exception in any route or webhook handler — a page render,
`/billing/webhook`, `/billing/webhook/stripe`, `/download/:token`, etc. — is automatically
reported to Sentry, with no code change needed at each call site. With no `SENTRY_DSN` bound
(local dev, or before an account exists), the Worker behaves exactly as it does today: no
crash, no behavior change, Sentry simply disabled.

Reference: `~/projeto_ebd/ebd-monorepo/apps/server/src/index.ts` — the same `@sentry/cloudflare`
package, wired as the outermost export:

```ts
export default Sentry.withSentry(
	(workerEnv) => ({
		dsn: workerEnv.SENTRY_DSN,
		enabled: Boolean(workerEnv.SENTRY_DSN),
		tracesSampleRate: 0,
	}),
	app,
);
```

DSN read per-request off the env binding (not module-load time), `enabled` gated on its
presence — mirrors this repo's own "unset ships fine, gated at go-live" convention already
used for Appmax/Resend (PLANNING.md §12). `tracesSampleRate: 0`: error capture only, no
performance tracing — this repo has no stated need for it yet.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] `@sentry/cloudflare` added as a dependency
- [ ] Worker's exported fetch handler wrapped in `Sentry.withSentry`, DSN + `enabled` shape
      as above
- [ ] `SENTRY_DSN=` added to `.dev.vars.example`, alongside the existing provider secrets
- [ ] With no DSN bound, full test suite (`pnpm test`) passes unchanged — confirms the SDK
      being disabled doesn't alter behavior
- [ ] PLANNING.md §3 stack table gets a new row recording the choice (reversible — no ADR
      needed)
- [ ] Verified end-to-end: a temporary debug route (e.g. `Sentry.captureException(new
      Error('test event'))` behind a throwaway path) hit once against a real DSN, event
      confirmed in the Sentry dashboard, **then the route deleted** — same
      verify-then-remove pattern as `projeto_ebd`'s own `/debug-sentry`
- [ ] `pnpm run typecheck` passes

## Comments

**No `src/index.ts` to wrap — Astro generates its own entry.** Unlike `projeto_ebd`'s Hono
app, this repo's Worker is entirely `@astrojs/cloudflare`-generated (`output: 'static'`,
per-page `prerender = false`); there's no hand-written top-level export. The adapter's own
convention resolves its Vite/Rollup SSR entry from whatever `wrangler.jsonc`'s `main` field
names (defaulting to `@astrojs/cloudflare/entrypoints/server` when unset) — confirmed against
`@astrojs/cloudflare`'s own `cloudflareConfigCustomizer` source and Sentry's own
"Astro on Cloudflare Workers" docs, which document exactly this pattern. So: `wrangler.jsonc`'s
`main` now points at `sentry.server.config.ts` (repo root, mirroring Sentry's own doc example),
which imports the adapter's default export from `@astrojs/cloudflare/entrypoints/server` and
wraps it in `Sentry.withSentry`. `astro build` picks this up and bundles Sentry straight into
`dist/server/entry.mjs` (confirmed: `grep -c Sentry` on the built output, upload size grew
~700 KiB → ~1090 KiB); `wrangler deploy --dry-run` resolves and lists it cleanly.

**This broke `@cloudflare/vitest-pool-workers`.** It reads `wrangler.jsonc` directly
(`vitest.config.ts`'s `wrangler.configPath`) and, once `main` was genuinely present, tried to
statically load `sentry.server.config.ts` as the test pool's worker — which fails standalone
(`@astrojs/cloudflare/entrypoints/server` needs a Vite virtual module only resolvable inside
Astro's own build, not under plain miniflare). Fixed by giving the test pool its own trivial
stand-in (`test/worker-entry.ts`) via `vitest.config.ts`'s top-level `main` option, which
pre-empts the `wrangler.jsonc`-derived one — tests call exported functions directly and never
hit a fetch handler, so this only needs to exist so miniflare has something loadable.

**Verified against a real DSN** (`wrangler dev` on the built output, `curl /debug-sentry` once
— `GET /debug-sentry 200 OK`), event confirmed by the user in the Sentry dashboard (issue
7754898234, "Error: test event", `runtime.name: cloudflare`), route then deleted.

**Follow-ups, deliberately out of scope here** (user: "add it later"):
- Source-map upload on deploy — dashboard stack traces on any real deploy (even the
  workers.dev test route) currently resolve to renamed/minified Vite chunk output, not
  original file:line. Needs a CI step + auth-token secret; bigger than this ticket.
- The captured test event's `environment` tag defaulted to `"production"` (Sentry's own
  default when `Sentry.withSentry`'s options don't set `environment`) — misleading for a
  workers.dev test-phase deploy. Worth setting explicitly once source-map/environment wiring
  is tackled together.
