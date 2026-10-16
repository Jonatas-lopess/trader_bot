import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import checkoutIdMigration from '../../../migrations/0013_purchase_checkout_id.sql?raw';
import { findByCheckout } from './purchase-lookup';

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

	it('round-trips payment instructions as JSON text, null by default (migrations/0016)', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES ('instr-none', 'starter', 'one_time', 0, 'pending')"
		).run();
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, payment_instructions) VALUES ('instr-pix', 'starter', 'one_time', 0, 'pending', ?)"
		)
			.bind(JSON.stringify({ qrCode: 'q', emvCode: 'e', expiresAt: 'x' }))
			.run();

		expect(await env.DB.prepare("SELECT payment_instructions FROM purchases WHERE id = 'instr-none'").first()).toEqual({
			payment_instructions: null,
		});
		const row = await env.DB.prepare("SELECT payment_instructions FROM purchases WHERE id = 'instr-pix'").first<{
			payment_instructions: string;
		}>();
		expect(JSON.parse(row!.payment_instructions)).toEqual({ qrCode: 'q', emvCode: 'e', expiresAt: 'x' });
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

// migrations/0013_purchase_checkout_id.sql (storefront-v2 ticket 10, ADR-0008): one row per Licença,
// the rows of a cart checkout share `checkout_id`. The migration already ran on an empty table, so
// the backfill is exercised by re-running its UPDATE over rows written the old way.
describe('purchases.checkout_id (migration 0013)', () => {
	const insertRow = (id: string, checkoutId: string | null, status = 'pending') =>
		env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, checkout_id) VALUES (?, 'starter', 'one_time', 100, ?, ?)"
		)
			.bind(id, status, checkoutId)
			.run();

	it('backfills old rows with their own id and leaves grouped rows alone', async () => {
		await insertRow('old-1', null, 'active');
		await insertRow('old-2', null);
		await insertRow('grouped-1', 'grouped-1');
		await insertRow('grouped-2', 'grouped-1');

		const backfill = checkoutIdMigration.match(/^UPDATE purchases SET checkout_id = id[^;]*;/m)?.[0];
		expect(backfill).toBeDefined();
		await env.DB.exec((backfill as string).replaceAll('\n', ' '));

		const { results } = await env.DB.prepare(
			"SELECT id, checkout_id FROM purchases WHERE id IN ('old-1', 'old-2', 'grouped-1', 'grouped-2') ORDER BY id"
		).all();
		expect(results).toEqual([
			{ id: 'grouped-1', checkout_id: 'grouped-1' },
			{ id: 'grouped-2', checkout_id: 'grouped-1' },
			{ id: 'old-1', checkout_id: 'old-1' },
			{ id: 'old-2', checkout_id: 'old-2' },
		]);
	});

	it('finds the rows of a checkout, and a lone purchase by its own id even with no checkout_id', async () => {
		await insertRow('find-grp', 'find-grp');
		await insertRow('find-grp-2', 'find-grp');
		await insertRow('find-other', 'find-other');
		await insertRow('find-legacy', null, 'active');

		expect((await findByCheckout(env, 'find-grp')).map((row) => row.id).sort()).toEqual(['find-grp', 'find-grp-2']);
		expect(await findByCheckout(env, 'find-legacy')).toEqual([
			{
				id: 'find-legacy',
				robotId: 'starter',
				offer: 'one_time',
				amountCents: 100,
				status: 'active',
				paymentMethod: null,
				paymentInstructions: null,
			},
		]);
		expect(await findByCheckout(env, 'find-grp-2')).toEqual([]);
		expect(await findByCheckout(env, 'nope')).toEqual([]);
	});
});
