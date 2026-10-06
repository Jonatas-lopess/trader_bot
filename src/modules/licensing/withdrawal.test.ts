import { describe, expect, it } from 'vitest';
import { withdrawalWindowOpen } from './withdrawal';

// 7 calendar days from `purchases.created_at` in Brasília time (UTC-3): the purchase day is
// excluded, day 7 is included to its last millisecond (CDC art. 49; withdrawal-guarantee/04).
// 12:00Z is 09:00 BRT on 2026-10-01, so day 7 is 2026-10-08 and the window closes at 03:00Z on the 9th.
const created = '2026-10-01T12:00:00.000Z';

describe('withdrawalWindowOpen', () => {
	it('is open right after the purchase', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-01T12:00:00.000Z'))).toBe(true);
	});

	it('is still open at the same time of day on day 7', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-08T12:00:00.000Z'))).toBe(true);
	});

	it('is open until the last millisecond of day 7 in Brasília time', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-09T02:59:59.999Z'))).toBe(true);
	});

	it('is closed from midnight Brasília time starting day 8', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-09T03:00:00.000Z'))).toBe(false);
	});

	it('is closed later on day 8', () => {
		expect(withdrawalWindowOpen(created, new Date('2026-10-09T12:00:00.000Z'))).toBe(false);
	});

	it('counts a late-evening Brasília purchase by its Brasília date, not its UTC date', () => {
		// 02:30Z on the 2nd is 23:30 BRT on the 1st, so day 7 is still the 8th.
		const lateEvening = '2026-10-02T02:30:00.000Z';
		expect(withdrawalWindowOpen(lateEvening, new Date('2026-10-09T02:59:59.999Z'))).toBe(true);
		expect(withdrawalWindowOpen(lateEvening, new Date('2026-10-09T03:00:00.000Z'))).toBe(false);
	});
});
