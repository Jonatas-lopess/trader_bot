import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWebhookRequest } from './webhook-hardening';
import { handleWebhook } from './webhook';

const ALLOWED_IP = '203.0.113.10';
const validPayload = JSON.stringify({ event: 'order.paid', order_id: 'ord_hardening' });

function envWithAllowedIp() {
	return { ...env, APPMAX_WEBHOOK_IPS: ALLOWED_IP };
}

describe('checkWebhookRequest', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('lets a legitimate request pass through to be processed by the core handler', async () => {
		await env.DB.prepare(
			'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id) VALUES (?, ?, ?, ?)'
		)
			.bind('sub-hardening-passthrough', 'starter', 'pending', 'ord_hardening_passthrough')
			.run();
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/oauth2/token')) {
				return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
			}
			return new Response(JSON.stringify({ data: { status: 'aprovado' } }), { status: 200 });
		});
		const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_hardening_passthrough' });

		const hardening = await checkWebhookRequest(envWithAllowedIp(), { sourceIp: ALLOWED_IP, rawBody: payload });
		expect(hardening).toEqual({ ok: true });

		const result = await handleWebhook(env, payload);
		expect(result).toEqual({ status: 200 });

		const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE id = ?')
			.bind('sub-hardening-passthrough')
			.first<{ status: string }>();
		expect(row?.status).toBe('active');
	});

	it('rejects a request from a non-Appmax IP', async () => {
		const result = await checkWebhookRequest(envWithAllowedIp(), {
			sourceIp: '198.51.100.1',
			rawBody: validPayload,
		});
		expect(result).toEqual({ ok: false, status: 403 });
	});

	it('rejects a request with no source IP at all', async () => {
		const result = await checkWebhookRequest(envWithAllowedIp(), { sourceIp: null, rawBody: validPayload });
		expect(result).toEqual({ ok: false, status: 403 });
	});

	it('fails closed when APPMAX_WEBHOOK_IPS is unconfigured (empty)', async () => {
		const result = await checkWebhookRequest(env, { sourceIp: ALLOWED_IP, rawBody: validPayload });
		expect(result).toEqual({ ok: false, status: 403 });
	});

	it('rejects a malformed payload from an allowed IP', async () => {
		const result = await checkWebhookRequest(envWithAllowedIp(), {
			sourceIp: ALLOWED_IP,
			rawBody: 'not json',
		});
		expect(result).toEqual({ ok: false, status: 400 });
	});

	it('lets a well-formed request from an allowed IP through', async () => {
		const result = await checkWebhookRequest(envWithAllowedIp(), {
			sourceIp: ALLOWED_IP,
			rawBody: validPayload,
		});
		expect(result).toEqual({ ok: true });
	});

	// The real WEBHOOK_RATE_LIMITER binding (wrangler.jsonc, Cloudflare's own
	// Rate Limiting API — ADR-0002) is used everywhere else in this file and
	// in production; a genuine flood against it was tried here first
	// (35 real calls to the same key, limit 30/10s) and never once returned
	// `success: false` under @cloudflare/vitest-pool-workers 0.22.0 +
	// miniflare 5.20260815.0-alpha, despite the binding being present and its
	// own source confirming a SQL-backed counter meant to persist across
	// calls. That looks like a local-simulation gap in this pinned toolchain
	// version, not something fixable from this file — so this one test
	// mocks the binding's own outcome instead, to test what this module
	// actually owns: correctly turning `{ success: false }` into a 429
	// before the payload-shape check, not the binding's own counting.
	it('rate-limits a flood from one source (binding outcome mocked — see comment above)', async () => {
		const floodEnv = {
			...envWithAllowedIp(),
			WEBHOOK_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) },
		};

		const result = await checkWebhookRequest(floodEnv, { sourceIp: ALLOWED_IP, rawBody: validPayload });

		expect(result).toEqual({ ok: false, status: 429 });
		expect(floodEnv.WEBHOOK_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: ALLOWED_IP });
	});
});
