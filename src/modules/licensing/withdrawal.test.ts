import { describe, expect, it } from 'vitest';
import { withdrawalWindowOpen } from './withdrawal';

// 7 days from `purchases.created_at` (CDC art. 49; owner decision in withdrawal-guarantee/04).
const created = '2026-10-01T12:00:00.000Z';

describe('withdrawalWindowOpen', () => {
	it('is open right after the purchase', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-01T12:00:00.000Z'))).toBe(true);
	});

	it('is open on day 7, up to the exact instant seven days after the purchase', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-08T12:00:00.000Z'))).toBe(true);
	});

	it('is closed one millisecond after day 7', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-08T12:00:00.001Z'))).toBe(false);
	});

	it('is closed on day 8', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-09T12:00:00.000Z'))).toBe(false);
	});
});
