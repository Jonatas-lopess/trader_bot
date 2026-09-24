import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { ROBOT_BINARY_BYTES, ROBOT_BINARY_CONTENT_TYPE, ROBOT_BINARY_KEY } from '../../../test/robot-binary-fixture';

// Proves the storage layer ticket 01 scaffolds: the `download_tokens` D1
// table round-trips under the real binding, and the dummy robot-binary
// fixture is present in the test R2 bucket — the base tickets 02 and 03
// build mint/dispatch/redeem and the end-to-end suite on top of
// (.scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md).
describe('download_tokens D1 schema + R2 fixture scaffold', () => {
	it('round-trips a download_tokens row', async () => {
		await env.DB.prepare('INSERT INTO download_tokens (token, customer_id, expires_at) VALUES (?, ?, ?)')
			.bind('tok_schema_1', 'cust_schema_1', '2027-01-01T00:00:00.000Z')
			.run();

		const row = await env.DB.prepare('SELECT * FROM download_tokens WHERE token = ?')
			.bind('tok_schema_1')
			.first();

		expect(row).toMatchObject({
			token: 'tok_schema_1',
			customer_id: 'cust_schema_1',
			expires_at: '2027-01-01T00:00:00.000Z',
			used_at: null,
		});
	});

	it('the test R2 bucket has the dummy robot-binary fixture seeded', async () => {
		const object = await env.ROBOT_BINARY.get(ROBOT_BINARY_KEY);
		expect(object).not.toBeNull();

		const bytes = new Uint8Array(await object!.arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
		expect(object!.httpMetadata?.contentType).toBe(ROBOT_BINARY_CONTENT_TYPE);
	});
});
