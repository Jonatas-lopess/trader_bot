import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getSubscriptionStatus } from './status';

async function seed(row: {
	id: string;
	plan_id: string;
	status: string;
	payment_method?: string | null;
}) {
	await env.DB.prepare(
		'INSERT INTO subscriptions (id, plan_id, status, payment_method) VALUES (?, ?, ?, ?)'
	)
		.bind(row.id, row.plan_id, row.status, row.payment_method ?? null)
		.run();
}

describe('getSubscriptionStatus', () => {
	it('reports pending for a fresh card checkout', async () => {
		await seed({ id: 'ref-pending-card', plan_id: 'starter', status: 'pending' });
		expect(await getSubscriptionStatus(env, 'ref-pending-card')).toEqual({ ok: true, state: 'pending' });
	});

	it('reports awaiting_boleto for a pending boleto checkout, not generic pending', async () => {
		await seed({ id: 'ref-pending-boleto', plan_id: 'starter', status: 'pending', payment_method: 'boleto' });
		expect(await getSubscriptionStatus(env, 'ref-pending-boleto')).toEqual({
			ok: true,
			state: 'awaiting_boleto',
		});
	});

	it('reports active once the webhook confirms it', async () => {
		await seed({ id: 'ref-active', plan_id: 'pro', status: 'active', payment_method: 'card' });
		expect(await getSubscriptionStatus(env, 'ref-active')).toEqual({ ok: true, state: 'active' });
	});

	it('returns not-found for a reference with no matching row, not a crash', async () => {
		expect(await getSubscriptionStatus(env, 'does-not-exist')).toEqual({ ok: false, status: 404 });
	});

	it('returns not-found for a missing reference', async () => {
		expect(await getSubscriptionStatus(env, null)).toEqual({ ok: false, status: 404 });
	});
});
