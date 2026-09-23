import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// Test-only binding (vitest.config.ts's `miniflare.bindings`), not part of
// the deployable Env in wrangler.jsonc — merged onto the generated
// Cloudflare.Env so test/apply-migrations.ts can read it without `any`.
// `declare global` is required here (not a bare `declare namespace`)
// because the leading `import` makes this file a module, which would
// otherwise scope the namespace augmentation locally instead of merging it
// with worker-configuration.d.ts's global `Cloudflare.Env`.
declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}
