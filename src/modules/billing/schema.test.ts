import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// Proves the real D1 binding (migrations/0001_billing_schema.sql) round-trips
// under @cloudflare/vitest-pool-workers — the pattern later billing tickets
// build on (.scratch/checkout-webhooks/issues/01-test-harness-d1-schema.md).
// No hand-rolled D1 stub: every later billing test runs against this same
// binding, so behaviour here matches production D1 semantics exactly.
describe('billing D1 schema', () => {
	it('round-trips a purchases row', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'monthly', 0, ?)"
		)
			.bind('checkout-attempt-1', 'starter', 'pending')
			.run();

		const row = await env.DB.prepare('SELECT * FROM purchases WHERE id = ?')
			.bind('checkout-attempt-1')
			.first();

		expect(row).toMatchObject({
			id: 'checkout-attempt-1',
			robot_id: 'starter',
			offer: 'monthly',
			amount_cents: 0,
			status: 'pending',
			payment_method: null,
			appmax_order_id: null,
			appmax_subscription_id: null,
			// migrations/0007_payment_provider.sql (docs/adr/0005-stripe-test-driver.md).
			provider: 'appmax',
		});
	});

	it('rejects a status outside the purchase lifecycle', async () => {
		await expect(
			env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'monthly', 0, ?)")
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

describe('catalog-pivot schema (migrations/0008_catalog_pivot.sql)', () => {
	it('rejects an unknown offer and a negative amount', async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES ('bad-offer', 'r', 'weekly', 0, 'pending')"
			).run()
		).rejects.toThrow();
		await expect(
			env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES ('bad-amount', 'r', 'one_time', -1, 'pending')"
			).run()
		).rejects.toThrow();
	});

	it('round-trips a licenses row: awaiting_account by default, corretora_account nullable', async () => {
		await env.DB.prepare("INSERT INTO licenses (purchase_id, robot_id) VALUES ('lic-schema-1', 'starter')").run();
		const row = await env.DB.prepare('SELECT * FROM licenses WHERE purchase_id = ?').bind('lic-schema-1').first();
		expect(row).toMatchObject({
			purchase_id: 'lic-schema-1',
			robot_id: 'starter',
			corretora_account: null,
			status: 'awaiting_account',
			expires_at: null,
		});

		await expect(
			env.DB.prepare(
				"INSERT INTO licenses (purchase_id, robot_id, status) VALUES ('lic-schema-2', 'starter', 'made-up')"
			).run()
		).rejects.toThrow();
	});
});
