import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import nfseRunbook from '../../../docs/ops/nfse.md?raw';
import { handleStripeWebhook } from './stripe-webhook';
import { handleWebhook } from './webhook';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

// Catalog-pivot ticket 13: buyer name + CPF/CNPJ for the manual NFS-e, persisted from the
// authoritative refetch only (never the webhook payload).

function mockAppmax(order: { customer?: { name?: string; email?: string; document_number?: string | null } }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
		}
		if (url.includes('/orders/')) {
			return new Response(
				JSON.stringify({
					data: {
						status: 'aprovado',
						payment_method: 'pix',
						customer: order.customer,
						amounts: { sub_total: 49_900, total_paid: 52_000, installment_fee: 2_100 },
					},
				}),
				{ status: 200 }
			);
		}
		if (url.includes('api.resend.com')) return new Response(null, { status: 200 });
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function seedPurchase(id: string, orderId: string, provider: 'appmax' | 'stripe' = 'appmax') {
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, 'starter', 'one_time', 49900, 'pending', ?, ?)"
	)
		.bind(id, provider, orderId)
		.run();
}

async function buyerOf(id: string) {
	return env.DB.prepare('SELECT status, buyer_name, buyer_document FROM purchases WHERE id = ?')
		.bind(id)
		.first<{ status: string; buyer_name: string | null; buyer_document: string | null }>();
}

const CUSTOMER = { name: 'Maria da Silva', email: 'maria@example.com', document_number: '123.456.789-09' };

describe('buyer fiscal data — Appmax', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('persists the refetched customer name and digits-only document', async () => {
		await seedPurchase('fis-ok', 'ord_fis_ok');
		mockAppmax({ customer: { ...CUSTOMER, email: 'ok@example.com' } });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_ok' }));

		expect(await buyerOf('fis-ok')).toEqual({
			status: 'active',
			buyer_name: 'Maria da Silva',
			buyer_document: '12345678909',
		});
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});

	it('keeps a CNPJ (14 digits) as digits only', async () => {
		await seedPurchase('fis-cnpj', 'ord_fis_cnpj');
		mockAppmax({ customer: { ...CUSTOMER, email: 'cnpj@example.com', document_number: '12.345.678/0001-95' } });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_cnpj' }));

		expect((await buyerOf('fis-cnpj'))?.buyer_document).toBe('12345678000195');
	});

	it('leaves both null without a document, still activates, and reports the purchase id only — no PII', async () => {
		await seedPurchase('fis-none', 'ord_fis_none');
		mockAppmax({ customer: { name: 'Maria da Silva', email: 'no-doc@example.com', document_number: null } });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_none' }));

		const row = await buyerOf('fis-none');
		expect(row?.status).toBe('active');
		expect(row?.buyer_document).toBeNull();
		expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
		const [message, options] = vi.mocked(Sentry.captureMessage).mock.calls[0];
		expect(message).toContain('buyer document');
		expect((options as { extra: unknown }).extra).toEqual({ provider: 'appmax', purchase_id: 'fis-none' });
		expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain('Maria');
	});

	it('treats an alphanumeric CNPJ as absent rather than stripping its letters', async () => {
		await seedPurchase('fis-alnum', 'ord_fis_alnum');
		mockAppmax({ customer: { ...CUSTOMER, email: 'alnum@example.com', document_number: '12.ABC.345/01DE-35' } });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_alnum' }));

		expect((await buyerOf('fis-alnum'))?.buyer_document).toBeNull();
	});

	it('first stored value wins: a later event cannot overwrite an invoiced buyer', async () => {
		await seedPurchase('fis-first', 'ord_fis_first');
		mockAppmax({ customer: { ...CUSTOMER, email: 'first@example.com' } });
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_first' }));

		vi.restoreAllMocks();
		mockAppmax({ customer: { name: 'Someone Else', email: 'first@example.com', document_number: '98765432100' } });
		await handleWebhook(env, JSON.stringify({ event: 'order.integrated', order_id: 'ord_fis_first' }));

		expect(await buyerOf('fis-first')).toMatchObject({ buyer_name: 'Maria da Silva', buyer_document: '12345678909' });
	});

	it('treats a malformed document (wrong digit count) as absent', async () => {
		await seedPurchase('fis-bad', 'ord_fis_bad');
		mockAppmax({ customer: { ...CUSTOMER, email: 'bad@example.com', document_number: '123' } });

		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_bad' }));

		expect((await buyerOf('fis-bad'))?.buyer_document).toBeNull();
	});

	it('ignores a name or document supplied in the webhook payload (tampered delivery)', async () => {
		await seedPurchase('fis-tamper', 'ord_fis_tamper');
		mockAppmax({ customer: { name: 'Real Buyer', email: 'tamper@example.com', document_number: null } });

		await handleWebhook(
			env,
			JSON.stringify({
				event: 'order.paid',
				order_id: 'ord_fis_tamper',
				buyer_document: '99999999999',
				data: {
					order_id: 'ord_fis_tamper',
					document_number: '99999999999',
					customer: { name: 'Attacker', document_number: '99999999999' },
				},
			})
		);

		const row = await buyerOf('fis-tamper');
		expect(row?.buyer_name).toBe('Real Buyer');
		expect(row?.buyer_document).toBeNull();
	});

	it('a later event without customer data does not erase what was stored', async () => {
		await seedPurchase('fis-keep', 'ord_fis_keep');
		mockAppmax({ customer: { ...CUSTOMER, email: 'keep@example.com' } });
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: 'ord_fis_keep' }));

		vi.restoreAllMocks();
		vi.clearAllMocks();
		mockAppmax({ customer: { email: 'keep@example.com' } });
		await handleWebhook(env, JSON.stringify({ event: 'order.integrated', order_id: 'ord_fis_keep' }));

		expect(await buyerOf('fis-keep')).toEqual({
			status: 'active',
			buyer_name: 'Maria da Silva',
			buyer_document: '12345678909',
		});
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
	});
});

describe('buyer fiscal data — Stripe test driver', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	const SECRET = 'whsec_test_do_not_use_in_production';

	async function sign(rawBody: string): Promise<string> {
		const timestamp = String(Math.floor(Date.now() / 1000));
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
		const hex = Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		return `t=${timestamp},v1=${hex}`;
	}

	it('fills name and document from the checkout session fixture', async () => {
		await seedPurchase('fis-stripe', 'cs_fis_stripe', 'stripe');
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/checkout/sessions/')) {
				return new Response(
					JSON.stringify({
						status: 'complete',
						payment_status: 'paid',
						subscription: null,
						amount_subtotal: 49_900,
						customer_details: {
							email: 'stripe@example.com',
							name: 'Maria da Silva',
							tax_ids: [{ type: 'br_cpf', value: '123.456.789-09' }],
						},
					}),
					{ status: 200 }
				);
			}
			if (url.includes('api.resend.com')) return new Response(null, { status: 200 });
			throw new Error(`unexpected fetch: ${url}`);
		});
		const body = JSON.stringify({
			id: 'evt_fis_stripe',
			type: 'checkout.session.completed',
			data: { object: { id: 'cs_fis_stripe', object: 'checkout.session', subscription: null } },
		});

		const result = await handleStripeWebhook(
			{ ...env, STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: SECRET },
			body,
			await sign(body)
		);

		expect(result).toEqual({ status: 200 });
		expect(await buyerOf('fis-stripe')).toEqual({
			status: 'active',
			buyer_name: 'Maria da Silva',
			buyer_document: '12345678909',
		});
	});
});

describe('docs/ops/nfse.md query', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	function queryFromRunbook(): string {
		const match = /```sql\n([\s\S]*?)```/.exec(nfseRunbook);
		if (match === null) throw new Error('no ```sql block in docs/ops/nfse.md');
		return match[1];
	}

	it('lists confirmed, not-yet-invoiced purchases with the nota fields', async () => {
		await seedPurchase('nf-paid', 'ord_nf_paid');
		await seedPurchase('nf-issued', 'ord_nf_issued');
		await seedPurchase('nf-pending', 'ord_nf_pending');
		await env.DB.prepare(
			"UPDATE purchases SET status = 'active', buyer_name = 'Maria', buyer_document = '12345678909', paid_at = '2026-09-01T10:00:00.000Z' WHERE id = 'nf-paid'"
		).run();
		await env.DB.prepare(
			"UPDATE purchases SET status = 'active', buyer_name = 'João', buyer_document = '12345678000195', nfse_issued_at = '2026-09-02', paid_at = '2026-09-01T11:00:00.000Z' WHERE id = 'nf-issued'"
		).run();

		const { results } = await env.DB.prepare(queryFromRunbook()).all<Record<string, unknown>>();
		const rows = results.filter((row) => String(row.purchase_id).startsWith('nf-'));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			purchase_id: 'nf-paid',
			buyer_name: 'Maria',
			buyer_document: '12345678909',
			amount_cents: 49_900,
			offer: 'one_time',
			nfse_issued_at: null,
		});
		expect(rows[0].paid_at).toBe('2026-09-01T10:00:00.000Z');
	});
});
