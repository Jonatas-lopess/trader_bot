import { describe, expect, it } from 'vitest';
import type { LicenseStatus } from '../modules/licensing/license-status';
import { corretoraNoticeTones, corretoraNoticeTexts, licenseBadges } from './conta';

const statuses: LicenseStatus['status'][] = ['none', 'awaiting_account', 'preparing', 'active', 'expired', 'revoked'];

describe('licenseBadges', () => {
	it('has a label, icon key and tone for every Licença state', () => {
		for (const status of statuses) {
			const badge = licenseBadges[status];
			expect(badge.label.length).toBeGreaterThan(0);
			expect(badge.icon.length).toBeGreaterThan(0);
			expect(['success', 'danger', 'neutral']).toContain(badge.tone);
		}
	});

	it('gives each state its own label', () => {
		const labels = statuses.map((status) => licenseBadges[status].label);
		expect(new Set(labels).size).toBe(statuses.length);
	});

	it('marks active as success and revoked/expired as danger', () => {
		expect(licenseBadges.active.tone).toBe('success');
		expect(licenseBadges.expired.tone).toBe('danger');
		expect(licenseBadges.revoked.tone).toBe('danger');
	});
});

describe('corretoraNoticeTones', () => {
	it('has a tone for every Corretora notice', () => {
		expect(Object.keys(corretoraNoticeTones).sort()).toEqual(Object.keys(corretoraNoticeTexts).sort());
		expect(corretoraNoticeTones.saved).toBe('success');
	});
});
