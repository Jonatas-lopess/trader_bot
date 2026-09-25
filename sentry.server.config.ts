/**
 * Wraps Astro's own generated Worker entry as the outermost export
 * (.scratch/sentry-integration/issues/01-wire-sentry-into-worker.md) — any
 * unhandled exception in any route/webhook handler reaches Sentry, no
 * per-call-site code needed. Referenced from `wrangler.jsonc`'s `main`,
 * overriding the adapter's own default entrypoint.
 *
 * DSN read per-request off the env binding (not module-load time), `enabled`
 * gated on its presence — same "unset ships fine, gated at go-live"
 * convention already used for Appmax/Resend (PLANNING.md §12). `environment`
 * likewise read per-request, off `SENTRY_ENVIRONMENT`
 * (src/shared/sentry-environment.ts) — sentry-integration/issues/07.
 */

import * as Sentry from '@sentry/cloudflare';
import handler from '@astrojs/cloudflare/entrypoints/server';
import { resolveSentryEnvironment } from './src/shared/sentry-environment';

export default Sentry.withSentry(
	(env) => ({
		dsn: env.SENTRY_DSN,
		enabled: Boolean(env.SENTRY_DSN),
		tracesSampleRate: 0,
		environment: resolveSentryEnvironment(env),
	}),
	handler,
);
