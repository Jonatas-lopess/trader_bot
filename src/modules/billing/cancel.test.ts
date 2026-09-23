import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscription } from './cancel';
import { handleWebhook } from './webhook';

function mockAppmaxCancel(outcome: 'ok' | 'fail') {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/cancel')) {
			return outcome === 'ok'
				? new Response(JSON.stringify({ data: { status: 'cancelado' } }), { status: 200 })
				: new Response(null, { status: 502 });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function seed(row: {
	id: string;
	appmax_order_id?: string;
	appmax_subscription_id?: string;
	status: string;
}) {
	await env.DB.prepare(
		'INSERT INTO subscriptions (id, plan_id, status, appmax_order_id, appmax_subscription_id) VALUES (?, ?, ?, ?, ?)'
	)
		.bind(row.id, 'starter', row.status, row.appmax_order_id ?? null, row.appmax_subscription_id ?? null)
		.run();
}

async function statusOf(id: string): Promise<string> {
	const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE id = ?').bind(id).first<{
		status: string;
	}>();
	if (row === null) throw new Error('row not found');
	return row.status;
}

describe('cancelSubscription', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('flips status to canceled on success and leaves licenses untouched', async () => {
		await seed({ id: 'sub-cancel-happy', appmax_subscription_id: 'appmax_sub_happy', status: 'active' });
		await env.DB.prepare(
			'INSERT INTO licenses (subscription_id, status, expires_at) VALUES (?, ?, ?)'
		)
			.bind('sub-cancel-happy', 'active', '2027-01-15T00:00:00.000Z')
			.run();
		mockAppmaxCancel('ok');

		const result = await cancelSubscription(env, {
			subscriptionId: 'sub-cancel-happy',
			appmaxSubscriptionId: 'appmax_sub_happy',
		});

		expect(result).toEqual({ ok: true });
		expect(await statusOf('sub-cancel-happy')).toBe('canceled');

		const license = await env.DB.prepare('SELECT * FROM licenses WHERE subscription_id = ?')
			.bind('sub-cancel-happy')
			.first();
		expect(license).toEqual({
			subscription_id: 'sub-cancel-happy',
			status: 'active',
			expires_at: '2027-01-15T00:00:00.000Z',
			created_at: license?.created_at,
			updated_at: license?.updated_at,
		});
	});

	it('returns no_appmax_subscription_id and touches neither D1 nor Appmax when there is nothing to cancel at Appmax', async () => {
		await seed({ id: 'sub-cancel-no-appmax-id', status: 'active' });
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await cancelSubscription(env, {
			subscriptionId: 'sub-cancel-no-appmax-id',
			appmaxSubscriptionId: null,
		});

		expect(result).toEqual({ ok: false, reason: 'no_appmax_subscription_id' });
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await statusOf('sub-cancel-no-appmax-id')).toBe('active');
	});

	it('leaves status unchanged when Appmax rejects the cancel call', async () => {
		await seed({ id: 'sub-cancel-appmax-fail', appmax_subscription_id: 'appmax_sub_fail', status: 'active' });
		mockAppmaxCancel('fail');

		const result = await cancelSubscription(env, {
			subscriptionId: 'sub-cancel-appmax-fail',
			appmaxSubscriptionId: 'appmax_sub_fail',
		});

		expect(result).toEqual({ ok: false, reason: 'appmax_unavailable' });
		expect(await statusOf('sub-cancel-appmax-fail')).toBe('active');
	});

	it('a cancel racing a concurrently-delivered webhook re-confirming active resolves to canceled, no lost update', async () => {
		// Mirrors e2e.test.ts's own concurrency test: one row reachable by two
		// different ids so one mock can answer both concurrent callers
		// deterministically (an order-scoped GET for the webhook's re-fetch, a
		// subscription-scoped POST /cancel for the customer-initiated write).
		await seed({
			id: 'sub-cancel-race',
			appmax_order_id: 'ord_race',
			appmax_subscription_id: 'sub_race',
			status: 'active',
		});

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/oauth2/token')) {
				return new Response(JSON.stringify({ access_token: 'race-token' }), { status: 200 });
			}
			if (url.includes('/subscriptions/sub_race/cancel')) {
				return new Response(JSON.stringify({ data: { status: 'cancelado' } }), { status: 200 });
			}
			// The webhook's own authoritative re-fetch — reports a stale
			// "still active" (e.g. a delayed renewal confirmation that predates
			// the cancel reaching Appmax's own system).
			if (url.includes('/orders/ord_race')) {
				return new Response(JSON.stringify({ data: { status: 'aprovado' } }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const cancel = cancelSubscription(env, {
			subscriptionId: 'sub-cancel-race',
			appmaxSubscriptionId: 'sub_race',
		});
		const webhook = handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_race' }));
		const [cancelResult, webhookResult] = await Promise.all([cancel, webhook]);

		expect(cancelResult.ok).toBe(true);
		expect(webhookResult).toEqual({ status: 200 });

		// `canceled` (rigidity 3) always wins over the webhook's `active`
		// (rigidity 1) regardless of which write actually lands first at D1:
		// if cancel runs first, the webhook's CAS (`CASE status ... <= 1`)
		// finds status already at rigidity 3 and refuses to apply; if the
		// webhook runs first, cancel's own CAS has no lower bound and
		// unconditionally forces `canceled` afterward. Neither write is lost
		// silently — the webhook's `meta.changes` would simply be 0 in the
		// order-matters case, which is the correct "did not apply" signal,
		// not a crash or a swallowed error.
		expect(await statusOf('sub-cancel-race')).toBe('canceled');
	});
});
