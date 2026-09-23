import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleWebhook } from './webhook';

function mockAppmax(status: { status: string; paymentMethod?: string }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/orders/') || url.includes('/subscriptions/')) {
			return new Response(
				JSON.stringify({ data: { status: status.status, payment_method: status.paymentMethod } }),
				{ status: 200 }
			);
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function seed(row: { id: string; appmax_order_id?: string; appmax_subscription_id?: string; status: string }) {
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

describe('handleWebhook', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('confirms a pending subscription to active by re-fetching Appmax, never trusting the payload status', async () => {
		await seed({ id: 'sub-happy', appmax_order_id: 'ord_happy', status: 'pending' });
		mockAppmax({ status: 'aprovado', paymentMethod: 'cartao' });

		const result = await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_happy' }));

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-happy')).toBe('active');
	});

	it('logs every delivery raw, independent of the idempotency check', async () => {
		await seed({ id: 'sub-log', appmax_order_id: 'ord_log', status: 'pending' });
		mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_log' });

		await handleWebhook(env, payload);
		await handleWebhook(env, payload); // duplicate

		const { results } = await env.DB.prepare(
			'SELECT * FROM webhook_deliveries WHERE idempotency_key = ?'
		)
			.bind('order.paid:ord_log')
			.all();
		expect(results).toHaveLength(2);
	});

	it('replays the same event idempotently: second delivery is a no-op and makes no Appmax status call', async () => {
		await seed({ id: 'sub-dup', appmax_order_id: 'ord_dup', status: 'pending' });
		const fetchSpy = mockAppmax({ status: 'aprovado' });
		const payload = JSON.stringify({ event: 'order.paid', order_id: 'ord_dup' });

		await handleWebhook(env, payload);
		const callsAfterFirst = fetchSpy.mock.calls.length;
		const result = await handleWebhook(env, payload);

		expect(result).toEqual({ status: 200 });
		expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst); // no new auth/status calls
		expect(await statusOf('sub-dup')).toBe('active');
	});

	it('never lets a less-current event undo a more-current one (out-of-order delivery)', async () => {
		await seed({ id: 'sub-stale', appmax_order_id: 'ord_stale', status: 'canceled' });
		mockAppmax({ status: 'aprovado' }); // a stale "it's active" re-fetch, delayed

		const result = await handleWebhook(
			env,
			JSON.stringify({ event: 'order.paid.delayed', order_id: 'ord_stale' })
		);

		expect(result).toEqual({ status: 200 });
		expect(await statusOf('sub-stale')).toBe('canceled');
	});

	it('ignores a webhook for an order/subscription with no matching row — no error, no new row', async () => {
		mockAppmax({ status: 'aprovado' });

		const result = await handleWebhook(
			env,
			JSON.stringify({ event: 'order.paid', order_id: 'ord_unknown_ref' })
		);

		expect(result).toEqual({ status: 200 });
		const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE appmax_order_id = ?')
			.bind('ord_unknown_ref')
			.first();
		expect(row).toBeNull();
	});

	it('responds 200 and does not throw for an unparseable body', async () => {
		const result = await handleWebhook(env, 'not json');
		expect(result).toEqual({ status: 200 });
	});
});
