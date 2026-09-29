import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { PurchaseStatus } from './payment-provider';
import { STATUS_RIGIDITY, STATUS_RIGIDITY_CASE_SQL } from './purchase-lookup';

const statuses = Object.keys(STATUS_RIGIDITY) as PurchaseStatus[];

// The exact CAS shape webhook.ts / stripe-webhook.ts run: an event applies
// only when the row's current rank is <= the incoming event's rank.
async function applyEvent(id: string, incoming: PurchaseStatus): Promise<number> {
	const result = await env.DB.prepare(
		`UPDATE purchases SET status = ? WHERE id = ? AND ${STATUS_RIGIDITY_CASE_SQL} <= ?`
	)
		.bind(incoming, id, STATUS_RIGIDITY[incoming])
		.run();
	return result.meta.changes;
}

describe('purchase status ranking (STATUS_RIGIDITY_CASE_SQL)', () => {
	it('ranks pending < rejected < active < past_due < canceled < refunded < chargeback', () => {
		expect(statuses.sort((a, b) => STATUS_RIGIDITY[a] - STATUS_RIGIDITY[b])).toEqual([
			'pending',
			'rejected',
			'active',
			'past_due',
			'canceled',
			'refunded',
			'chargeback',
		]);
	});

	for (const current of statuses) {
		for (const incoming of statuses) {
			const shouldApply = STATUS_RIGIDITY[incoming] >= STATUS_RIGIDITY[current];
			it(`${incoming} event ${shouldApply ? 'applies over' : 'cannot overwrite'} ${current}`, async () => {
				const id = `rank-${current}-${incoming}`;
				await env.DB.prepare(
					"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, 'starter', 'one_time', 0, ?)"
				)
					.bind(id, current)
					.run();

				expect(await applyEvent(id, incoming)).toBe(shouldApply ? 1 : 0);

				const row = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?')
					.bind(id)
					.first<{ status: string }>();
				expect(row?.status).toBe(shouldApply ? incoming : current);
			});
		}
	}
});
