import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { PurchaseStatus } from './payment-provider';
import { aggregateCheckoutStatus, derivePurchaseView, getPurchaseStatus, getPurchaseView } from './status';

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
		// A pending card row is in antifraud review (appmax-checkout 06).
		expect(await getPurchaseStatus(env, 'grp-two')).toEqual({ ok: true, state: 'card_in_review' });
	});
});

describe('derivePurchaseView (pure, appmax-checkout 06)', () => {
	const NOW = new Date('2026-10-16T15:00:00.000Z'); // 12:00 in Brasília (UTC-3)
	const PIX = JSON.stringify({
		qrCode: 'data:image/png;base64,iVBORw0KGgo=',
		emvCode: '00020126580014br.gov.bcb.pix0136abc',
		expiresAt: '2026-10-16 23:59:59',
	});
	const BOLETO = JSON.stringify({
		pdfUrl: 'https://boleto.sandboxappmax.com.br/b/1.pdf',
		digitableLine: '34191.79001 01043.510047 91020.150008 1 99990000099700',
		dueDate: '2026-10-19',
	});
	const row = (over: Partial<Parameters<typeof derivePurchaseView>[0][number]> = {}) => ({
		status: 'pending' as PurchaseStatus,
		paymentMethod: 'pix' as string | null,
		paymentInstructions: PIX as string | null,
		robotId: 'robo-a',
		offer: 'annual' as const,
		...over,
	});

	it('a pending Pix shows its QR, copy-paste code and deadline, parsed from Brasília time', () => {
		expect(derivePurchaseView([row()], NOW)).toEqual({
			state: 'awaiting_pix',
			method: 'pix',
			instructions: {
				kind: 'pix',
				qrSrc: 'data:image/png;base64,iVBORw0KGgo=',
				emvCode: '00020126580014br.gov.bcb.pix0136abc',
				expiresAt: '2026-10-17T02:59:59.000Z',
			},
			line: { robotId: 'robo-a', offer: 'annual' },
		});
	});

	it('a Pix past its deadline is pix_expired', () => {
		expect(derivePurchaseView([row()], new Date('2026-10-17T03:00:00.000Z'))?.state).toBe('pix_expired');
	});

	it('accepts an ISO deadline with a zone, and an https QR source', () => {
		const instructions = JSON.stringify({ qrCode: 'https://qr.appmax.com.br/1.png', emvCode: 'abc', expiresAt: '2026-10-16T14:00:00Z' });
		const view = derivePurchaseView([row({ paymentInstructions: instructions })], NOW);
		expect(view).toMatchObject({ state: 'pix_expired', instructions: { qrSrc: 'https://qr.appmax.com.br/1.png' } });
	});

	it.each([
		['a javascript: URL', 'javascript:alert(1)'],
		['an http URL', 'http://qr.example/1.png'],
		['an svg data URI', 'data:image/svg+xml;base64,PHN2Zz4='],
		['a png data URI with junk', 'data:image/png;base64,abc"><script>'],
	])('drops a QR source that is %s but keeps the code', (_label, qrCode) => {
		const instructions = JSON.stringify({ qrCode, emvCode: 'abc', expiresAt: '2026-10-16 23:59:59' });
		expect(derivePurchaseView([row({ paymentInstructions: instructions })], NOW)).toMatchObject({
			state: 'awaiting_pix',
			instructions: { qrSrc: null, emvCode: 'abc' },
		});
	});

	it.each([
		['no instructions', null],
		['unparseable JSON', '{nope'],
		['a JSON array', '[]'],
		['neither QR nor code', JSON.stringify({ expiresAt: '2026-10-16 23:59:59' })],
	])('a Pix with %s degrades to the generic pending state', (_label, paymentInstructions) => {
		expect(derivePurchaseView([row({ paymentInstructions })], NOW)).toMatchObject({ state: 'pending', instructions: null });
	});

	it('an unparseable deadline keeps the Pix on screen without one', () => {
		const instructions = JSON.stringify({ qrCode: 'data:image/png;base64,AAAA', emvCode: 'abc', expiresAt: 'amanhã' });
		expect(derivePurchaseView([row({ paymentInstructions: instructions })], NOW)).toMatchObject({
			state: 'awaiting_pix',
			instructions: { expiresAt: null },
		});
	});

	it('a pending Boleto shows the PDF link, digitable line and due date', () => {
		expect(derivePurchaseView([row({ paymentMethod: 'boleto', paymentInstructions: BOLETO })], NOW)).toMatchObject({
			state: 'awaiting_boleto',
			method: 'boleto',
			instructions: {
				kind: 'boleto',
				pdfUrl: 'https://boleto.sandboxappmax.com.br/b/1.pdf',
				digitableLine: '34191.79001 01043.510047 91020.150008 1 99990000099700',
				dueDate: '2026-10-19',
			},
		});
	});

	it('a Boleto is overdue only after its due date ends in Brasília', () => {
		const boleto = row({ paymentMethod: 'boleto', paymentInstructions: BOLETO });
		expect(derivePurchaseView([boleto], new Date('2026-10-20T02:59:00.000Z'))?.state).toBe('awaiting_boleto');
		expect(derivePurchaseView([boleto], new Date('2026-10-20T03:00:00.000Z'))?.state).toBe('boleto_overdue');
	});

	it('drops a non-https PDF link but keeps the digitable line', () => {
		const instructions = JSON.stringify({ pdfUrl: 'javascript:alert(1)', digitableLine: '3419', dueDate: '2026-10-19' });
		expect(derivePurchaseView([row({ paymentMethod: 'boleto', paymentInstructions: instructions })], NOW)).toMatchObject({
			state: 'awaiting_boleto',
			instructions: { pdfUrl: null, digitableLine: '3419' },
		});
	});

	it('a Boleto with no instructions keeps the existing awaiting_boleto message, with nothing to show', () => {
		expect(derivePurchaseView([row({ paymentMethod: 'boleto', paymentInstructions: null })], NOW)).toMatchObject({
			state: 'awaiting_boleto',
			instructions: null,
		});
	});

	it('a pending card is in antifraud review', () => {
		expect(derivePurchaseView([row({ paymentMethod: 'card', paymentInstructions: null })], NOW)).toMatchObject({
			state: 'card_in_review',
			method: 'card',
			instructions: null,
		});
	});

	it('a pending row with no method yet stays generic pending', () => {
		expect(derivePurchaseView([row({ paymentMethod: null, paymentInstructions: null })], NOW)?.state).toBe('pending');
	});

	it.each(['active', 'rejected', 'refunded', 'chargeback'] as const)('a %s Pix purchase shows its status, not the instructions', (status) => {
		expect(derivePurchaseView([row({ status })], NOW)).toMatchObject({ state: status, instructions: null });
	});

	it('has no view for no rows, and no single line for a multi-row checkout', () => {
		expect(derivePurchaseView([], NOW)).toBeNull();
		expect(derivePurchaseView([row(), row({ robotId: 'robo-b' })], NOW)?.line).toBeNull();
	});
});

describe('getPurchaseView over D1', () => {
	it('reads the instructions written by the pay endpoint, so a reload shows the same Pix', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, payment_method, payment_instructions, checkout_id) VALUES ('view-pix', 'robo-a', 'annual', 100, 'pending', 'pix', ?, 'view-pix')"
		)
			.bind(JSON.stringify({ qrCode: 'data:image/png;base64,AAAA', emvCode: 'abc', expiresAt: '2026-10-16 23:59:59' }))
			.run();
		const now = new Date('2026-10-16T15:00:00.000Z');

		const first = await getPurchaseView(env, 'view-pix', now);
		const reload = await getPurchaseView(env, 'view-pix', now);

		expect(first).toMatchObject({ ok: true, view: { state: 'awaiting_pix', instructions: { emvCode: 'abc' } } });
		expect(reload).toEqual(first);
	});

	it('is not found for a missing or unknown reference', async () => {
		expect(await getPurchaseView(env, null)).toEqual({ ok: false, status: 404 });
		expect(await getPurchaseView(env, 'view-nope')).toEqual({ ok: false, status: 404 });
	});

	it('getPurchaseStatus answers the same state as the view', async () => {
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, payment_method, checkout_id) VALUES ('view-card', 'robo-a', 'one_time', 100, 'pending', 'card', 'view-card')"
		).run();
		expect(await getPurchaseStatus(env, 'view-card')).toEqual({ ok: true, state: 'card_in_review' });
	});
});
