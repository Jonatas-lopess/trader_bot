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

**Status:** ready-for-agent

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
