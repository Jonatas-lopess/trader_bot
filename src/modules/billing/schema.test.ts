import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// Proves the real D1 binding (migrations/0001_billing_schema.sql) round-trips
// under @cloudflare/vitest-pool-workers — the pattern later billing tickets
// build on (.scratch/checkout-webhooks/issues/01-test-harness-d1-schema.md).
// No hand-rolled D1 stub: every later billing test runs against this same
// binding, so behaviour here matches production D1 semantics exactly.
describe('billing D1 schema', () => {
	it('round-trips a subscriptions row', async () => {
		await env.DB.prepare(
			'INSERT INTO subscriptions (id, plan_id, status) VALUES (?, ?, ?)'
		)
			.bind('checkout-attempt-1', 'starter', 'pending')
			.run();

		const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?')
			.bind('checkout-attempt-1')
			.first();

		expect(row).toMatchObject({
			id: 'checkout-attempt-1',
			plan_id: 'starter',
			status: 'pending',
			payment_method: null,
			appmax_order_id: null,
			appmax_subscription_id: null,
		});
	});

	it('rejects a status outside the plan lifecycle', async () => {
		await expect(
			env.DB.prepare('INSERT INTO subscriptions (id, plan_id, status) VALUES (?, ?, ?)')
				.bind('checkout-attempt-2', 'starter', 'made-up-status')
				.run()
		).rejects.toThrow();
	});

	it('round-trips a processed_webhooks row and enforces idempotency on the composite id', async () => {
		await env.DB.prepare('INSERT INTO processed_webhooks (id) VALUES (?)')
			.bind('order.paid:ord_1')
			.run();

		const row = await env.DB.prepare('SELECT * FROM processed_webhooks WHERE id = ?')
			.bind('order.paid:ord_1')
			.first();
		expect(row).toMatchObject({ id: 'order.paid:ord_1' });

		// The PRIMARY KEY violation this triggers *is* the "already processed"
		// signal ticket 04's webhook handler relies on — no prior SELECT.
		await expect(
			env.DB.prepare('INSERT INTO processed_webhooks (id) VALUES (?)')
				.bind('order.paid:ord_1')
				.run()
		).rejects.toThrow();
	});

	// migrations/0002_webhook_deliveries.sql: the raw-payload log ticket 04's
	// webhook handler writes unconditionally, before the idempotency check —
	// separate from processed_webhooks above, so a duplicate delivery's
	// payload is never silently dropped (spec.md user story 7).
	it('round-trips a webhook_deliveries row, independent of idempotency', async () => {
		await env.DB.prepare('INSERT INTO webhook_deliveries (idempotency_key, payload) VALUES (?, ?)')
			.bind('order.paid:ord_1', '{"event":"order.paid"}')
			.run();
		await env.DB.prepare('INSERT INTO webhook_deliveries (idempotency_key, payload) VALUES (?, ?)')
			.bind('order.paid:ord_1', '{"event":"order.paid"}')
			.run();

		const { results } = await env.DB.prepare(
			'SELECT * FROM webhook_deliveries WHERE idempotency_key = ?'
		)
			.bind('order.paid:ord_1')
			.all();
		expect(results).toHaveLength(2);
	});
});
