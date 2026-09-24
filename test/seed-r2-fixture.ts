import { env } from 'cloudflare:workers';
import { ROBOT_BINARY_BYTES, ROBOT_BINARY_CONTENT_TYPE, ROBOT_BINARY_KEY } from './robot-binary-fixture';

// .scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md's
// R2 test fixture, seeded per test file the same way apply-migrations.ts
// seeds D1 per test file (@cloudflare/vitest-pool-workers' isolated storage).
await env.ROBOT_BINARY.put(ROBOT_BINARY_KEY, ROBOT_BINARY_BYTES, {
	httpMetadata: { contentType: ROBOT_BINARY_CONTENT_TYPE },
});
