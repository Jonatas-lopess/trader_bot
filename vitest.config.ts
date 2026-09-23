import { defineConfig } from 'vitest/config';

// Plain Vitest config, not Astro's `getViteConfig`. Nothing here renders
// .astro components yet (PLANNING.md §5: Vitest covers webhook handling,
// token issuance and session validation — none of which exist in this
// scaffold). Switch to `getViteConfig` from `astro/config` if a later
// ticket needs to test .astro component output.
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
	},
});
