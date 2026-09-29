import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { OfferName } from '../../content/catalog';
import type { PurchaseStatus } from '../billing/payment-provider';
import { LIFETIME_EXPIRY, deriveLicenseExpiry, licenseSyncStatement, type LicenseExpiryChange } from './license-expiry';

const NOW = new Date('2026-03-15T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const IN_12_MONTHS = '2027-03-15T12:00:00.000Z';
const IN_1_MONTH = '2026-04-15T12:00:00.000Z';

const OFFERS: OfferName[] = ['one_time', 'annual', 'monthly'];

// Offer × status. Only `active` depends on the offer; the others are offer-agnostic.
const EXPECTED: Record<PurchaseStatus, Record<OfferName, LicenseExpiryChange>> = {
	pending: { one_time: { kind: 'none' }, annual: { kind: 'none' }, monthly: { kind: 'none' } },
	rejected: { one_time: { kind: 'none' }, annual: { kind: 'none' }, monthly: { kind: 'none' } },
	active: {
		one_time: { kind: 'set_if_unset', at: LIFETIME_EXPIRY },
		annual: { kind: 'set_if_unset', at: IN_12_MONTHS },
		monthly: { kind: 'extend_to', at: IN_1_MONTH },
	},
	past_due: { one_time: { kind: 'none' }, annual: { kind: 'none' }, monthly: { kind: 'none' } },
	canceled: { one_time: { kind: 'none' }, annual: { kind: 'none' }, monthly: { kind: 'none' } },
	refunded: {
		one_time: { kind: 'end_now', at: NOW_ISO },
		annual: { kind: 'end_now', at: NOW_ISO },
		monthly: { kind: 'end_now', at: NOW_ISO },
	},
	chargeback: {
		one_time: { kind: 'end_now', at: NOW_ISO },
		annual: { kind: 'end_now', at: NOW_ISO },
		monthly: { kind: 'end_now', at: NOW_ISO },
	},
};

describe('deriveLicenseExpiry', () => {
	for (const [status, byOffer] of Object.entries(EXPECTED) as [PurchaseStatus, Record<OfferName, LicenseExpiryChange>][]) {
		for (const offer of OFFERS) {
			it(`${offer} × ${status}`, () => {
				expect(deriveLicenseExpiry({ offer, status, now: NOW })).toEqual(byOffer[offer]);
			});
		}
	}

	it('clamps the month rollover to the last day of a shorter month', () => {
		const change = deriveLicenseExpiry({ offer: 'monthly', status: 'active', now: new Date('2026-01-31T00:00:00.000Z') });
		expect(change).toEqual({ kind: 'extend_to', at: '2026-02-28T00:00:00.000Z' });
	});
});

async function seedPurchase(id: string, offer: OfferName, status: PurchaseStatus) {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, 'starter', ?, 0, ?)"
	)
		.bind(id, offer, status)
		.run();
}

async function expiryOf(id: string): Promise<string | null | undefined> {
	const row = await env.DB.prepare('SELECT expires_at FROM licenses WHERE purchase_id = ?')
		.bind(id)
		.first<{ expires_at: string | null }>();
	return row === null ? undefined : row.expires_at;
}

async function apply(id: string, offer: OfferName, status: PurchaseStatus, now: Date) {
	const stmt = licenseSyncStatement(env, { purchaseId: id, robotId: 'starter', offer, status, now });
	if (stmt !== null) await stmt.run();
}

describe('licenseSyncStatement', () => {
	it('creates the Licença on first activation with the derived expiry (Compra → sentinel)', async () => {
		await seedPurchase('exp-onetime', 'one_time', 'active');
		await apply('exp-onetime', 'one_time', 'active', NOW);
		expect(await expiryOf('exp-onetime')).toBe(LIFETIME_EXPIRY);
	});

	it('does not extend an Anual Licença when the active event is replayed', async () => {
		await seedPurchase('exp-annual', 'annual', 'active');
		await apply('exp-annual', 'annual', 'active', NOW);
		await apply('exp-annual', 'annual', 'active', new Date('2026-06-01T00:00:00.000Z'));
		expect(await expiryOf('exp-annual')).toBe(IN_12_MONTHS);
	});

	it('extends a Mensal Licença on each renewal but never shortens it', async () => {
		await seedPurchase('exp-monthly', 'monthly', 'active');
		await apply('exp-monthly', 'monthly', 'active', NOW);
		await apply('exp-monthly', 'monthly', 'active', new Date('2026-04-14T12:00:00.000Z'));
		expect(await expiryOf('exp-monthly')).toBe('2026-05-14T12:00:00.000Z');
		await apply('exp-monthly', 'monthly', 'active', NOW);
		expect(await expiryOf('exp-monthly')).toBe('2026-05-14T12:00:00.000Z');
	});

	it('leaves the paid term alone on canceled', async () => {
		await seedPurchase('exp-canceled', 'annual', 'active');
		await apply('exp-canceled', 'annual', 'active', NOW);
		await env.DB.prepare("UPDATE purchases SET status = 'canceled' WHERE id = 'exp-canceled'").run();
		await apply('exp-canceled', 'annual', 'canceled', new Date('2026-05-01T00:00:00.000Z'));
		expect(await expiryOf('exp-canceled')).toBe(IN_12_MONTHS);
	});

	it('sets expiry to now on refund', async () => {
		await seedPurchase('exp-refund', 'one_time', 'active');
		await apply('exp-refund', 'one_time', 'active', NOW);
		await env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = 'exp-refund'").run();
		const later = new Date('2026-03-20T00:00:00.000Z');
		await apply('exp-refund', 'one_time', 'refunded', later);
		expect(await expiryOf('exp-refund')).toBe(later.toISOString());
	});

	it('does not move expiry forward when a refund is redelivered', async () => {
		await seedPurchase('exp-redeliver', 'one_time', 'active');
		await apply('exp-redeliver', 'one_time', 'active', NOW);
		await env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = 'exp-redeliver'").run();
		await apply('exp-redeliver', 'one_time', 'refunded', NOW);
		await apply('exp-redeliver', 'one_time', 'refunded', new Date('2026-03-20T00:00:00.000Z'));
		expect(await expiryOf('exp-redeliver')).toBe(NOW_ISO);
	});

	it('cannot be undone by a lower-ranked event: the guard skips the write once the purchase outranks it', async () => {
		await seedPurchase('exp-undo', 'one_time', 'active');
		await apply('exp-undo', 'one_time', 'active', NOW);
		await env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = 'exp-undo'").run();
		await apply('exp-undo', 'one_time', 'refunded', NOW);
		// A late `active` event: the webhook CAS is blocked, so purchases.status stays `refunded`.
		await apply('exp-undo', 'one_time', 'active', new Date('2026-03-16T00:00:00.000Z'));
		expect(await expiryOf('exp-undo')).toBe(NOW_ISO);
	});

	it('does not create a Licença for a refund of a purchase that never activated', async () => {
		await seedPurchase('exp-never', 'one_time', 'refunded');
		await apply('exp-never', 'one_time', 'refunded', NOW);
		expect(await expiryOf('exp-never')).toBeUndefined();
	});

	it('returns no statement for statuses that never change expiry', () => {
		expect(licenseSyncStatement(env, { purchaseId: 'x', robotId: 'starter', offer: 'annual', status: 'canceled', now: NOW })).toBeNull();
	});
});
