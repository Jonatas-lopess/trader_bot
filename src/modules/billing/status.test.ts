import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { PurchaseStatus } from './payment-provider';
import { aggregateCheckoutStatus, getPurchaseStatus } from './status';

async function seed(row: {
	id: string;
	plan_id: string;
	status: string;
	payment_method?: string | null;
}) {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, payment_method) VALUES (?, ?, 'monthly', 0, ?, ?)"
	)
		.bind(row.id, row.plan_id, row.status, row.payment_method ?? null)
		.run();
}

describe('getPurchaseStatus', () => {
	it('reports pending for a fresh card checkout', async () => {
		await seed({ id: 'ref-pending-card', plan_id: 'starter', status: 'pending' });
		expect(await getPurchaseStatus(env, 'ref-pending-card')).toEqual({ ok: true, state: 'pending' });
	});

	it('reports awaiting_boleto for a pending boleto checkout, not generic pending', async () => {
		await seed({ id: 'ref-pending-boleto', plan_id: 'starter', status: 'pending', payment_method: 'boleto' });
		expect(await getPurchaseStatus(env, 'ref-pending-boleto')).toEqual({
			ok: true,
			state: 'awaiting_boleto',
		});
	});

	it('reports active once the webhook confirms it', async () => {
		await seed({ id: 'ref-active', plan_id: 'pro', status: 'active', payment_method: 'card' });
		expect(await getPurchaseStatus(env, 'ref-active')).toEqual({ ok: true, state: 'active' });
	});

	it('reports rejected (paid, held for review) as its own state', async () => {
		await seed({ id: 'ref-rejected', plan_id: 'pro', status: 'rejected', payment_method: 'card' });
		expect(await getPurchaseStatus(env, 'ref-rejected')).toEqual({ ok: true, state: 'rejected' });
	});

	it('returns not-found for a reference with no matching row, not a crash', async () => {
		expect(await getPurchaseStatus(env, 'does-not-exist')).toEqual({ ok: false, status: 404 });
	});

	it('returns not-found for a missing reference', async () => {
		expect(await getPurchaseStatus(env, null)).toEqual({ ok: false, status: 404 });
	});
});

describe('aggregateCheckoutStatus (pure, ADR-0006 ranking)', () => {
	const rows = (...statuses: PurchaseStatus[]) => statuses.map((status) => ({ status, paymentMethod: 'card' }));

	it('has no state for no rows', () => {
		expect(aggregateCheckoutStatus([])).toBeNull();
	});

	it('returns a single row own status, whatever it is', () => {
		for (const status of ['pending', 'rejected', 'active', 'past_due', 'canceled', 'refunded', 'chargeback'] as const) {
			expect(aggregateCheckoutStatus(rows(status))).toBe(status);
		}
	});

	it('reports a uniform group as that status', () => {
		for (const status of ['pending', 'rejected', 'active', 'refunded', 'chargeback'] as const) {
			expect(aggregateCheckoutStatus(rows(status, status, status))).toBe(status);
		}
	});

	it('lets any rejected row win over every other combination', () => {
		expect(aggregateCheckoutStatus(rows('active', 'rejected'))).toBe('rejected');
		expect(aggregateCheckoutStatus(rows('pending', 'rejected'))).toBe('rejected');
		expect(aggregateCheckoutStatus(rows('rejected', 'refunded', 'active'))).toBe('rejected');
	});

	it('is not active while any row is still pending', () => {
		expect(aggregateCheckoutStatus(rows('active', 'pending', 'active'))).toBe('pending');
		expect(aggregateCheckoutStatus(rows('refunded', 'pending'))).toBe('pending');
	});

	it('keeps the boleto wait for a group with a pending boleto row', () => {
		expect(
			aggregateCheckoutStatus([
				{ status: 'pending', paymentMethod: 'boleto' },
				{ status: 'pending', paymentMethod: 'boleto' },
			])
		).toBe('awaiting_boleto');
		expect(aggregateCheckoutStatus([{ status: 'active', paymentMethod: 'boleto' }])).toBe('active');
	});

	it('surfaces the highest-ranked status once every row is past payment', () => {
		expect(aggregateCheckoutStatus(rows('active', 'refunded'))).toBe('refunded');
		expect(aggregateCheckoutStatus(rows('refunded', 'chargeback', 'active'))).toBe('chargeback');
		expect(aggregateCheckoutStatus(rows('active', 'past_due'))).toBe('past_due');
		expect(aggregateCheckoutStatus(rows('canceled', 'active'))).toBe('canceled');
	});

	it('does not depend on row order', () => {
		expect(aggregateCheckoutStatus(rows('refunded', 'active'))).toBe(aggregateCheckoutStatus(rows('active', 'refunded')));
	});
});

describe('getPurchaseStatus over a checkout group', () => {
	async function seedGroup(checkoutId: string, statuses: string[], paymentMethod: string | null = 'card') {
		for (const [index, status] of statuses.entries()) {
			await env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, payment_method, checkout_id) VALUES (?, 'starter', 'one_time', 100, ?, ?, ?)"
			)
				.bind(index === 0 ? checkoutId : `${checkoutId}-${index}`, status, paymentMethod, checkoutId)
				.run();
		}
	}

	it('answers for all the rows sharing the checkout id', async () => {
		await seedGroup('grp-active', ['active', 'active', 'active']);
		expect(await getPurchaseStatus(env, 'grp-active')).toEqual({ ok: true, state: 'active' });
		await seedGroup('grp-pending', ['pending', 'pending'], 'boleto');
		expect(await getPurchaseStatus(env, 'grp-pending')).toEqual({ ok: true, state: 'awaiting_boleto' });
		await seedGroup('grp-held', ['rejected', 'rejected']);
		expect(await getPurchaseStatus(env, 'grp-held')).toEqual({ ok: true, state: 'rejected' });
	});

	it('does not mix up two checkouts', async () => {
		await seedGroup('grp-one', ['active', 'active']);
		await seedGroup('grp-two', ['pending']);
		expect(await getPurchaseStatus(env, 'grp-one')).toEqual({ ok: true, state: 'active' });
		expect(await getPurchaseStatus(env, 'grp-two')).toEqual({ ok: true, state: 'pending' });
	});
});
