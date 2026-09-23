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
		setupFiles: ['./test/apply-migrations.ts'],
	},
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
			return {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: { TEST_MIGRATIONS: migrations },
				},
			};
		}),
	],
});
