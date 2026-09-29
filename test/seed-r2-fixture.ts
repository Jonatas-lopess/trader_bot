import { FIXTURE_LICENSE_ID, putLicenseBinary } from './robot-binary-fixture';

// .scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md's
// R2 test fixture, seeded per test file the same way apply-migrations.ts
// seeds D1 per test file (@cloudflare/vitest-pool-workers' isolated storage).
await putLicenseBinary(FIXTURE_LICENSE_ID);
