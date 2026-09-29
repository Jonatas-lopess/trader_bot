import { env } from 'cloudflare:workers';

// The dummy robot-binary fixture — .scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md:
// "a small dummy binary object uploaded into the test R2 bucket (miniflare)
// so tickets 02 and 03 have real bytes to mint links against and stream
// back." Real bytes (not a placeholder string treated as text), so a
// byte-for-byte comparison in ticket 03's end-to-end test is meaningful.
// `.ex5` is the compiled-binary extension MT5 Expert Advisors actually ship
// as (CONTEXT.md — the Robô is an MT5 Expert Advisor).
//
// Per-Licença since catalog-pivot 08: each Licença's binary lives at
// `licenses/<license_id>.ex5` (ADR-0006), so tests upload the fixture bytes under the id
// they seeded via `putLicenseBinary`. `FIXTURE_LICENSE_ID` is the one seeded for every test
// file by `seed-r2-fixture.ts`.
export const FIXTURE_LICENSE_ID = 'fixture-license';
export const ROBOT_BINARY_CONTENT_TYPE = 'application/octet-stream';
export const ROBOT_BINARY_BYTES = new TextEncoder().encode('ROBO-TRADER-EX5-FIXTURE-BINARY-PAYLOAD');

export const licenseBinaryKey = (licenseId: string): string => `licenses/${licenseId}.ex5`;
export const ROBOT_BINARY_KEY = licenseBinaryKey(FIXTURE_LICENSE_ID);

export async function putLicenseBinary(licenseId: string): Promise<void> {
	await env.ROBOT_BINARY.put(licenseBinaryKey(licenseId), ROBOT_BINARY_BYTES, {
		httpMetadata: { contentType: ROBOT_BINARY_CONTENT_TYPE },
	});
}
