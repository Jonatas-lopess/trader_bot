import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { FIXTURE_LICENSE_ID, ROBOT_BINARY_BYTES, ROBOT_BINARY_CONTENT_TYPE, ROBOT_BINARY_KEY } from '../../../test/robot-binary-fixture';
import { streamRobotBinary } from './robot-binary';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

// The "binary storage" concern PLANNING.md §4 lists for `modules/licensing`
// — one object per Licença at `licenses/<license_id>.ex5` (ADR-0006).
describe('streamRobotBinary', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('streams the fixture object with its content type, filename, and size', async () => {
		const result = await streamRobotBinary(env, FIXTURE_LICENSE_ID);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok result');
		expect(result.contentType).toBe(ROBOT_BINARY_CONTENT_TYPE);
		expect(result.filename).toBe(`${FIXTURE_LICENSE_ID}.ex5`);
		expect(result.size).toBe(ROBOT_BINARY_BYTES.byteLength);

		const bytes = new Uint8Array(await new Response(result.body).arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
	});

	it('reports failure when the object is missing from the bucket', async () => {
		await env.ROBOT_BINARY.delete(ROBOT_BINARY_KEY);

		const result = await streamRobotBinary(env, FIXTURE_LICENSE_ID);

		expect(result).toEqual({ ok: false });
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			expect.stringContaining('R2 object missing'),
			expect.objectContaining({ extra: expect.objectContaining({ key: ROBOT_BINARY_KEY, licenseId: FIXTURE_LICENSE_ID }) })
		);
	});

	it('does not serve another Licença\'s object', async () => {
		const result = await streamRobotBinary(env, 'lic-with-no-object');

		expect(result).toEqual({ ok: false });
	});
});
