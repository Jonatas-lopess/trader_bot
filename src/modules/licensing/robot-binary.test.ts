import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import { ROBOT_BINARY_BYTES, ROBOT_BINARY_CONTENT_TYPE, ROBOT_BINARY_KEY } from '../../../test/robot-binary-fixture';
import { streamRobotBinary } from './robot-binary';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

// The "binary storage" concern PLANNING.md §4 lists for `modules/licensing`
// — CONTEXT.md: "Robô: one program, not a family of them", so this reads
// one fixed R2 key, no per-plan variant.
describe('streamRobotBinary', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('streams the fixture object with its content type, filename, and size', async () => {
		const result = await streamRobotBinary(env);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected ok result');
		expect(result.contentType).toBe(ROBOT_BINARY_CONTENT_TYPE);
		expect(result.filename).toBe(ROBOT_BINARY_KEY);
		expect(result.size).toBe(ROBOT_BINARY_BYTES.byteLength);

		const bytes = new Uint8Array(await new Response(result.body).arrayBuffer());
		expect(bytes).toEqual(ROBOT_BINARY_BYTES);
	});

	it('reports failure when the object is missing from the bucket', async () => {
		await env.ROBOT_BINARY.delete(ROBOT_BINARY_KEY);

		const result = await streamRobotBinary(env);

		expect(result).toEqual({ ok: false });
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			expect.stringContaining('R2 object missing'),
			expect.objectContaining({ extra: expect.objectContaining({ key: ROBOT_BINARY_KEY }) })
		);
	});
});
