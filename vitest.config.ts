import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Real Workers runtime + real D1 binding (@cloudflare/vitest-pool-workers),
// per spec.md's Testing Decisions: "runs against the real Workers runtime
// and a real D1 binding ... Only fetch calls to Appmax's API are mocked, so
// the compare-and-swap and idempotency behavior is tested against real D1
// semantics rather than a hand-rolled stub that could drift from them."
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		setupFiles: ['./test/apply-migrations.ts', './test/seed-r2-fixture.ts'],
		// The default 5s is occasionally too tight for a test that touches
		// WEBHOOK_RATE_LIMITER (a Durable-Object-backed binding) alongside a
		// D1 write and a mocked fetch — its cold start has been observed to
		// add several seconds on its own (.scratch/checkout-webhooks/issues/06-webhook-hardening.md).
		testTimeout: 15000,
	},
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
			return {
				// Explicit `main` pre-empts wrangler.jsonc's own `main`
				// (sentry.server.config.ts) — that file imports
				// `@astrojs/cloudflare/entrypoints/server`, loadable only inside
				// Astro's own Vite build, not standalone under miniflare
				// (sentry-integration/issues/01; see test/worker-entry.ts).
				main: './test/worker-entry.ts',
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						// SESSION_SECRET is a real secret (wrangler secret put /
						// .dev.vars), never committed — modules/identity/session.ts's
						// Web Crypto HMAC import throws on an empty key, so tests need
						// *some* fixed value here. Not a production credential.
						SESSION_SECRET: 'test-session-secret-do-not-use-in-production',
					},
				},
			};
		}),
	],
});
