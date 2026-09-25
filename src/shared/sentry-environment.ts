/**
 * Distinguishes which deploy a captured Sentry event came from
 * (sentry.server.config.ts). Sentry's own `environment` option defaults to
 * `"production"` when unset, which would mislabel the only deploy target
 * that exists today (the workers.dev test route, PLANNING.md §12) and any
 * future production deploy alike. Falls back to `'unconfigured'` rather
 * than a guessed value — this repo has no wrangler.jsonc per-environment
 * blocks, so nothing here can tell a bare `wrangler dev` apart from a CI
 * deploy that never got the var set; either way, "not production" is the
 * only claim this can honestly make (sentry-integration/issues/07).
 */

type SentryEnvironmentEnv = Pick<Cloudflare.Env, 'SENTRY_ENVIRONMENT'>;

export function resolveSentryEnvironment(env: SentryEnvironmentEnv): string {
	// `||`, not `??` — an unset `.dev.vars`/CI var and a blank
	// `SENTRY_ENVIRONMENT=` line (this repo's own documented "leave blank to
	// disable" convention, e.g. `.dev.vars.example`) must both fall back the
	// same way, same as `SENTRY_DSN`'s own `Boolean(env.SENTRY_DSN)` gate
	// treating an empty string as unset.
	return env.SENTRY_ENVIRONMENT || 'unconfigured';
}
