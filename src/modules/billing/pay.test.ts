import { env } from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { resetAppmaxTokenCache } from './appmax-client';
import { pay } from './pay';
import { handleWebhook } from './webhook';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

const API = 'https://api.sandboxappmax.com.br';

const BUYER = {
	name: 'Maria  de Souza Silva ',
	email: 'Maria.Compra@Example.com',
	phone: '(11) 98765-4321',
	document: '123.456.789-09',
};
const CARD_TOKEN = 'tok_card_secret_123';

type Call = { url: string; method: string; body: Record<string, unknown> | null };

type Routes = Partial<Record<'customers' | 'orders' | 'credit-card' | 'pix' | 'boleto', (call: Call) => Response | Promise<Response>>>;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

const okRoutes: Required<Routes> = {
	customers: () => json({ data: { customer: { id: 501 } } }),
	orders: () => json({ data: { order: { id: 9001, status: 'pendente' } } }),
	'credit-card': () => json({ data: { order: { id: 9001, status: 'autorizado' } } }),
	pix: () =>
		json({
			data: {
				pix: {
					qr_code: 'data:image/png;base64,iVBORw0KGgo=',
					emv_code: '00020126580014br.gov.bcb.pix0136abc',
					expires_at: '2026-10-16 23:59:59',
				},
			},
		}),
	boleto: () =>
		json({
			data: {
				boleto: {
					pdf_url: 'https://boleto.sandboxappmax.com.br/b/9001.pdf',
					digitable_line: '34191.79001 01043.510047 91020.150008 1 99990000099700',
					due_date: '2026-10-19',
				},
			},
		}),
};

/** Mocks Appmax at `fetch` (the only mocked boundary) and records every API call in order. */
function mockAppmax(overrides: Routes = {}) {
	const calls: Call[] = [];
	const routes = { ...okRoutes, ...overrides };
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.endsWith('/oauth2/token')) return json({ access_token: 'tok', expires_in: 3600 });
		const call: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null };
		calls.push(call);
		const name = (
			{
				[`${API}/v1/customers`]: 'customers',
				[`${API}/v1/orders`]: 'orders',
				[`${API}/v1/payments/credit-card`]: 'credit-card',
				[`${API}/v1/payments/pix`]: 'pix',
				[`${API}/v1/payments/boleto`]: 'boleto',
			} as Record<string, keyof Routes>
		)[url];
		if (name === undefined) throw new Error(`unexpected fetch: ${url}`);
		return routes[name](call);
	});
	return calls;
}

const pathsOf = (calls: Call[]) => calls.map((call) => call.url.replace(API, ''));

function payEnv(overrides: Record<string, unknown> = {}) {
	return {
		DB: env.DB,
		APPMAX_CLIENT_ID: 'client',
		APPMAX_CLIENT_SECRET: 'secret',
		APPMAX_ENV: 'sandbox',
		PAY_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
		...overrides,
	} as unknown as Parameters<typeof pay>[0];
}

function body(overrides: Record<string, unknown> = {}) {
	return {
		reference: crypto.randomUUID(),
		robot: 'robo-exemplo-a',
		offer: 'one_time',
		method: 'pix',
		buyer: BUYER,
		...overrides,
	};
}

async function rowOf(id: string) {
	return env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<Record<string, unknown>>();
}

describe('pay (POST /checkout/pay)', () => {
	beforeEach(async () => {
		resetAppmaxTokenCache();
		await clearCatalog();
		await seedRobot({ slug: 'robo-exemplo-a', offers: { one_time: 99700, annual: 49700 } });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it.each([
		['one_time', 'card', 99700],
		['one_time', 'pix', 99700],
		['one_time', 'boleto', 99700],
		['annual', 'card', 49700],
		['annual', 'pix', 49700],
		['annual', 'boleto', 49700],
	])('%s by %s writes one pending row priced from the catalog and returns the confirmation redirect', async (offer, method, amount) => {
		const calls = mockAppmax();
		const request = body({ offer, method, ...(method === 'card' ? { token: CARD_TOKEN } : {}) });

		const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

		expect(result).toEqual({ ok: true, redirectUrl: `/checkout/confirmacao?ref=${request.reference}` });
		expect(await rowOf(request.reference)).toMatchObject({
			robot_id: 'robo-exemplo-a',
			offer,
			amount_cents: amount,
			status: 'pending',
			provider: 'appmax',
			payment_method: method,
			buyer_name: 'Maria de Souza Silva',
			buyer_document: '12345678909',
			appmax_order_id: '9001',
			checkout_id: request.reference,
		});
		const paymentPath = { card: '/v1/payments/credit-card', pix: '/v1/payments/pix', boleto: '/v1/payments/boleto' }[method];
		expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders', paymentPath]);
		expect(calls[1].body).toMatchObject({
			customer_id: '501',
			products: [{ sku: `robo-exemplo-a:${offer}`, quantity: 1, unit_value: amount }],
		});
	});

	it('sends the buyer to Appmax as split name, normalized e-mail, digits-only phone and document', async () => {
		const calls = mockAppmax();

		await pay(payEnv(), { body: body(), ip: '203.0.113.7' });

		expect(calls[0].body).toEqual({
			first_name: 'Maria',
			last_name: 'de Souza Silva',
			email: 'maria.compra@example.com',
			phone: '11987654321',
			document_number: '12345678909',
			ip: '203.0.113.7',
		});
		expect(calls[2].body).toEqual({ order_id: '9001', payment_data: { pix: { document_number: '12345678909' } } });
	});

	it('pays the card with the browser token and the buyer document, one installment', async () => {
		const calls = mockAppmax();

		await pay(payEnv(), { body: body({ method: 'card', token: CARD_TOKEN, holderName: 'MARIA S SILVA' }), ip: '203.0.113.7' });

		expect(calls[2].body).toMatchObject({
			order_id: '9001',
			customer_id: '501',
			payment_data: {
				credit_card: { token: CARD_TOKEN, holder_document_number: '12345678909', holder_name: 'MARIA S SILVA', installments: 1 },
			},
		});
	});

	it('persists the Pix instructions on the row', async () => {
		mockAppmax();
		const request = body({ method: 'pix' });

		await pay(payEnv(), { body: request, ip: '203.0.113.7' });

		const row = await rowOf(request.reference);
		expect(JSON.parse(String(row?.payment_instructions))).toEqual({
			qrCode: 'data:image/png;base64,iVBORw0KGgo=',
			emvCode: '00020126580014br.gov.bcb.pix0136abc',
			expiresAt: '2026-10-16 23:59:59',
		});
	});

	it('persists the Boleto instructions on the row; a card stores none', async () => {
		mockAppmax();
		const boleto = body({ method: 'boleto' });
		const card = body({ method: 'card', token: CARD_TOKEN });

		await pay(payEnv(), { body: boleto, ip: '203.0.113.7' });
		await pay(payEnv(), { body: card, ip: '203.0.113.7' });

		expect(JSON.parse(String((await rowOf(boleto.reference))?.payment_instructions))).toEqual({
			pdfUrl: 'https://boleto.sandboxappmax.com.br/b/9001.pdf',
			digitableLine: '34191.79001 01043.510047 91020.150008 1 99990000099700',
			dueDate: '2026-10-19',
		});
		expect((await rowOf(card.reference))?.payment_instructions).toBeNull();
	});

	it('writes appmax_order_id before calling the payment endpoint', async () => {
		const request = body({ method: 'card', token: CARD_TOKEN });
		let orderIdAtPayment: unknown = 'not called';
		mockAppmax({
			'credit-card': async () => {
				orderIdAtPayment = (await rowOf(request.reference))?.appmax_order_id;
				return okRoutes['credit-card']({} as Call);
			},
		});

		await pay(payEnv(), { body: request, ip: '203.0.113.7' });

		expect(orderIdAtPayment).toBe('9001');
	});

	it('attempts no payment when the order id cannot be written on the row', async () => {
		const request = body({ method: 'card', token: CARD_TOKEN });
		const calls = mockAppmax({
			orders: async () => {
				// The row is gone by the time the order exists: the UPDATE matches nothing.
				await env.DB.prepare('DELETE FROM purchases WHERE id = ?').bind(request.reference).run();
				return okRoutes.orders({} as Call);
			},
		});

		const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

		expect(result).toMatchObject({ ok: false, status: 502 });
		expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders']);
	});

	it('a repeated POST with the same reference creates no second customer, order or charge', async () => {
		const calls = mockAppmax();
		const request = body({ method: 'card', token: CARD_TOKEN });

		const first = await pay(payEnv(), { body: request, ip: '203.0.113.7' });
		const second = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

		expect(second).toEqual(first);
		expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders', '/v1/payments/credit-card']);
		const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases WHERE id = ?').bind(request.reference).first<{ n: number }>();
		expect(rows?.n).toBe(1);
	});

	describe('card declined', () => {
		it.each([
			['a 4xx "Payment not authorized"', () => json({ message: 'Payment not authorized' }, 422)],
			['a 2xx with the order cancelado', () => json({ data: { order: { id: 9001, status: 'cancelado' } } })],
		])('%s: 402 with a fresh reference, the row stays pending, no card data stored', async (_label, decline) => {
			mockAppmax({ 'credit-card': decline });
			const request = body({ method: 'card', token: CARD_TOKEN });

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 402, code: 'card_declined' });
			if (result.ok || result.status !== 402) throw new Error('expected a decline');
			expect(result.reference).not.toBe(request.reference);
			expect(result.reference).toMatch(/^[0-9a-f-]{36}$/);
			const row = await rowOf(request.reference);
			expect(row?.status).toBe('pending');
			expect(JSON.stringify(row)).not.toContain(CARD_TOKEN);
		});
	});

	describe('Appmax failures', () => {
		it('customer creation fails: 502 with a fresh reference, no order, the row stays inert', async () => {
			const calls = mockAppmax({ customers: () => json({ message: 'down' }, 503) });
			const request = body();

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 502, code: 'provider_unavailable' });
			if (result.ok) throw new Error('expected a failure');
			expect('reference' in result && result.reference).not.toBe(request.reference);
			expect(pathsOf(calls)).toEqual(['/v1/customers']);
			expect(await rowOf(request.reference)).toMatchObject({ status: 'pending', appmax_order_id: null });
		});

		it('order creation fails: 502, no payment, no order id on the row', async () => {
			const calls = mockAppmax({ orders: () => json({ message: 'bad' }, 422) });
			const request = body();

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 502 });
			expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders']);
			expect(await rowOf(request.reference)).toMatchObject({ status: 'pending', appmax_order_id: null });
		});

		it('payment fails: 502, the order id stays on the row for the webhook', async () => {
			mockAppmax({ pix: () => json({}, 500) });
			const request = body({ method: 'pix' });

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 502 });
			expect(await rowOf(request.reference)).toMatchObject({ status: 'pending', appmax_order_id: '9001', payment_instructions: null });
		});

		it('an auth failure is a 502', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'invalid_client' }, 401));
			const result = await pay(payEnv(), { body: body(), ip: '203.0.113.7' });
			expect(result).toMatchObject({ ok: false, status: 502 });
		});
	});

	describe('rejected before anything is created', () => {
		it.each([
			['an unknown robot', { robot: 'no-such-robot' }, 'unknown_offer'],
			['an unknown offer', { offer: 'lifetime' }, 'unknown_offer'],
			['Mensal (ticket 09)', { offer: 'monthly', method: 'card', token: CARD_TOKEN }, 'offer_not_supported'],
			['an unknown method', { method: 'bitcoin' }, 'invalid_request'],
			['a card without a token', { method: 'card' }, 'token_required'],
			['a missing reference', { reference: undefined }, 'invalid_request'],
			['a reference that is not a UUID', { reference: 'ref-1' }, 'invalid_request'],
		])('%s: 400', async (_label, overrides, code) => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const request = body(overrides);

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 400, code });
			expect(fetchSpy).not.toHaveBeenCalled();
			if (typeof request.reference === 'string') expect(await rowOf(request.reference)).toBeNull();
		});

		it('invalid buyer fields: 400 with every field error', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			const result = await pay(payEnv(), {
				body: body({ buyer: { name: 'Maria', email: 'nope', phone: '123', document: '111.111.111-11' } }),
				ip: '203.0.113.7',
			});

			expect(result).toEqual({
				ok: false,
				status: 400,
				code: 'invalid_buyer',
				fieldErrors: { name: 'name_invalid', email: 'email_invalid', phone: 'phone_invalid', document: 'document_invalid' },
			});
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('a body that is not an object: 400', async () => {
			const result = await pay(payEnv(), { body: 'nope', ip: '203.0.113.7' });
			expect(result).toMatchObject({ ok: false, status: 400, code: 'invalid_request' });
		});

		it('a tampered price in the body is ignored: the catalog price is charged and stored', async () => {
			const calls = mockAppmax();
			const request = body({ amount: 1, amountCents: 1, price: 1, unit_value: 1 });

			await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect((calls[1].body as { products: { unit_value: number }[] }).products[0].unit_value).toBe(99700);
			expect((await rowOf(request.reference))?.amount_cents).toBe(99700);
		});
	});

	describe('client IP (ADR-0007)', () => {
		it('sandbox without CF-Connecting-IP falls back to 127.0.0.1', async () => {
			const calls = mockAppmax();
			await pay(payEnv(), { body: body(), ip: null });
			expect(calls[0].body).toMatchObject({ ip: '127.0.0.1' });
		});

		it('production without a usable IP fails closed with a Sentry report, before anything is created', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const request = body();

			const result = await pay(payEnv({ APPMAX_ENV: 'production' }), { body: request, ip: null });

			expect(result).toMatchObject({ ok: false, status: 502 });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(await rowOf(request.reference)).toBeNull();
			expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('client IP'), expect.anything());
		});
	});

	it('over the rate limit: 429, nothing called or written', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
		const request = body();

		const result = await pay(payEnv({ PAY_RATE_LIMITER: limiter }), { body: request, ip: '203.0.113.7' });

		expect(result).toEqual({ ok: false, status: 429, code: 'rate_limited' });
		expect(limiter.limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.7' });
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await rowOf(request.reference)).toBeNull();
	});

	it('never puts personal or card data in logs or Sentry', async () => {
		const logged: unknown[] = [];
		for (const level of ['log', 'info', 'warn', 'error'] as const) {
			vi.spyOn(console, level).mockImplementation((...args) => logged.push(args));
		}
		const secrets = [CARD_TOKEN, 'maria.compra@example.com', 'Maria', 'Silva', '12345678909', '123.456.789-09', '11987654321', '98765-4321'];

		mockAppmax({ customers: () => json({ message: 'Invalid document 12345678909 for maria.compra@example.com' }, 422) });
		await pay(payEnv(), { body: body({ method: 'card', token: CARD_TOKEN }), ip: '203.0.113.7' });
		vi.restoreAllMocks();
		for (const level of ['log', 'info', 'warn', 'error'] as const) {
			vi.spyOn(console, level).mockImplementation((...args) => logged.push(args));
		}
		mockAppmax({ 'credit-card': () => json({ message: `Payment not authorized for ${CARD_TOKEN}` }, 422) });
		await pay(payEnv(), { body: body({ method: 'card', token: CARD_TOKEN }), ip: '203.0.113.7' });
		mockAppmax({ boleto: () => json({}, 503) });
		await pay(payEnv(), { body: body({ method: 'boleto' }), ip: '203.0.113.7' });

		const captured = JSON.stringify([logged, vi.mocked(Sentry.captureMessage).mock.calls, vi.mocked(Sentry.captureException).mock.calls]);
		expect(vi.mocked(Sentry.captureMessage).mock.calls.length).toBeGreaterThan(0);
		for (const secret of secrets) expect(captured).not.toContain(secret);
	});

	describe('a cart of several Licenças (storefront-v2 11, ADR-0008)', () => {
		beforeEach(async () => {
			await seedRobot({ slug: 'robo-exemplo-b', name: 'Robô B', offers: { one_time: 149700, annual: 59700 } });
			await seedRobot({ slug: 'robo-rascunho', status: 'draft', offers: { one_time: 10000 } });
		});

		const CART = [
			{ robot: 'robo-exemplo-a', offer: 'one_time', quantity: 2 },
			{ robot: 'robo-exemplo-b', offer: 'annual', quantity: 1 },
		];

		function cartBody(overrides: Record<string, unknown> = {}) {
			const { robot: _robot, offer: _offer, ...rest } = body({ lines: CART, ...overrides });
			return rest;
		}

		async function rowsOf(reference: string) {
			const { results } = await env.DB.prepare('SELECT * FROM purchases WHERE checkout_id = ? ORDER BY robot_id, id')
				.bind(reference)
				.all<Record<string, unknown>>();
			return results;
		}

		it('a 3-Licença cart writes 3 pending rows and one Appmax order with one product per line and the catalog total', async () => {
			const calls = mockAppmax();
			const request = cartBody({ method: 'pix' });

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toEqual({ ok: true, redirectUrl: `/checkout/confirmacao?ref=${request.reference}` });
			const rows = await rowsOf(request.reference);
			expect(rows.map((row) => [row.robot_id, row.offer, row.amount_cents])).toEqual([
				['robo-exemplo-a', 'one_time', 99700],
				['robo-exemplo-a', 'one_time', 99700],
				['robo-exemplo-b', 'annual', 59700],
			]);
			for (const row of rows) {
				expect(row).toMatchObject({
					status: 'pending',
					provider: 'appmax',
					payment_method: 'pix',
					buyer_name: 'Maria de Souza Silva',
					buyer_document: '12345678909',
					appmax_order_id: '9001',
					checkout_id: request.reference,
				});
				expect(JSON.parse(String(row.payment_instructions))).toMatchObject({ emvCode: '00020126580014br.gov.bcb.pix0136abc' });
			}
			// The first row's id is the reference (ticket 10), the others are fresh ids.
			expect(new Set(rows.map((row) => row.id)).size).toBe(3);
			expect(rows.map((row) => row.id)).toContain(request.reference);

			expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders', '/v1/payments/pix']);
			expect(calls[1].body).toMatchObject({
				products: [
					{ sku: 'robo-exemplo-a:one_time', name: 'Robô robo-exemplo-a', quantity: 2, unit_value: 99700, type: 'digital' },
					{ sku: 'robo-exemplo-b:annual', name: 'Robô B', quantity: 1, unit_value: 59700, type: 'digital' },
				],
			});
		});

		it('writes the order id on every row before the payment call', async () => {
			const request = cartBody({ method: 'card', token: CARD_TOKEN });
			let orderIdsAtPayment: unknown[] = [];
			mockAppmax({
				'credit-card': async () => {
					orderIdsAtPayment = (await rowsOf(request.reference)).map((row) => row.appmax_order_id);
					return okRoutes['credit-card']({} as Call);
				},
			});

			await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(orderIdsAtPayment).toEqual(['9001', '9001', '9001']);
		});

		it('a retried POST with the same reference creates no rows, order or charge', async () => {
			const calls = mockAppmax();
			const request = cartBody({ method: 'boleto' });

			const first = await pay(payEnv(), { body: request, ip: '203.0.113.7' });
			const second = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(second).toEqual(first);
			expect(pathsOf(calls)).toEqual(['/v1/customers', '/v1/orders', '/v1/payments/boleto']);
			expect(await rowsOf(request.reference)).toHaveLength(3);
		});

		it('a retry carrying more lines under the same reference still creates nothing', async () => {
			const calls = mockAppmax();
			const request = cartBody();
			await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			await pay(payEnv(), { body: { ...request, lines: [...CART, { robot: 'robo-exemplo-b', offer: 'one_time', quantity: 1 }] }, ip: '203.0.113.7' });

			expect(pathsOf(calls)).toHaveLength(3);
			expect(await rowsOf(request.reference)).toHaveLength(3);
		});

		it('ignores prices smuggled into the lines', async () => {
			const calls = mockAppmax();
			const request = cartBody({
				lines: CART.map((line) => ({ ...line, unitCents: 1, amountCents: 1, unit_value: 1, price: 1 })),
				totalCents: 3,
			});

			await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect((calls[1].body as { products: { unit_value: number }[] }).products.map((p) => p.unit_value)).toEqual([99700, 59700]);
			expect((await rowsOf(request.reference)).map((row) => row.amount_cents)).toEqual([99700, 99700, 59700]);
		});

		it.each([
			['a Mensal line', [...CART, { robot: 'robo-exemplo-a', offer: 'monthly', quantity: 1 }], 'offer_not_supported'],
			['a line with an offer that does not exist', [...CART, { robot: 'robo-exemplo-a', offer: 'lifetime', quantity: 1 }], 'unknown_offer'],
			['a draft Robô', [...CART, { robot: 'robo-rascunho', offer: 'one_time', quantity: 1 }], 'unknown_offer'],
			['an unknown Robô', [{ robot: 'no-such-robot', offer: 'one_time', quantity: 1 }], 'unknown_offer'],
			['a quantity over the cap', [{ robot: 'robo-exemplo-a', offer: 'one_time', quantity: 6 }], 'invalid_request'],
			['a repeated line that sums over the cap', [
				{ robot: 'robo-exemplo-a', offer: 'one_time', quantity: 3 },
				{ robot: 'robo-exemplo-a', offer: 'one_time', quantity: 3 },
			], 'invalid_request'],
			['a zero quantity', [{ robot: 'robo-exemplo-a', offer: 'one_time', quantity: 0 }], 'invalid_request'],
			['an empty cart', [], 'invalid_request'],
			['lines that are not a list', 'robo-exemplo-a', 'invalid_request'],
		])('%s rejects the whole cart with 400 before anything is created', async (_label, lines, code) => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const request = cartBody({ lines });

			const result = await pay(payEnv(), { body: request, ip: '203.0.113.7' });

			expect(result).toMatchObject({ ok: false, status: 400, code });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(await rowsOf(request.reference)).toHaveLength(0);
		});
	});

	it('the buyer name and document from our form survive the webhook COALESCE', async () => {
		mockAppmax({ orders: () => json({ data: { order: { id: 'ord_coalesce', status: 'pendente' } } }) });
		const request = body({ method: 'pix' });
		await pay(payEnv(), { body: request, ip: '203.0.113.7' });
		vi.restoreAllMocks();

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.endsWith('/oauth2/token')) return json({ access_token: 'tok', expires_in: 3600 });
			if (url.includes('/v1/orders/ord_coalesce')) {
				return json({
					data: {
						order: { id: 'ord_coalesce', status: 'aprovado', amounts: { sub_total: 99700 } },
						payment: { method: 'pix' },
						customer: { name: 'Outro Nome', email: 'maria.compra@example.com', document_number: '529.982.247-25' },
					},
				});
			}
			if (url.includes('api.resend.com')) return json({ id: 'r' });
			throw new Error(`unexpected fetch: ${url}`);
		});
		await handleWebhook(env, JSON.stringify({ event: 'order_paid_by_pix', data: { order_id: 'ord_coalesce' } }));

		expect(await rowOf(request.reference)).toMatchObject({
			status: 'active',
			buyer_name: 'Maria de Souza Silva',
			buyer_document: '12345678909',
		});
	});
});
