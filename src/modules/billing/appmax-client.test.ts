import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	appmaxHosts,
	cancelSubscription,
	createCustomer,
	createOrder,
	fetchAuthoritativeStatus,
	getOrder,
	payBoleto,
	payCreditCard,
	payPix,
	resetAppmaxTokenCache,
} from './appmax-client';

const SANDBOX_AUTH = 'https://auth.sandboxappmax.com.br/oauth2/token';
const SANDBOX_API = 'https://api.sandboxappmax.com.br';

const env = { APPMAX_CLIENT_ID: 'client-1', APPMAX_CLIENT_SECRET: 'secret-1' };

type Call = { url: string; init: RequestInit };

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

/** Routes `fetch` by full URL and records every call. The token endpoint answers unless `token` overrides it. */
function mockAppmax(
	routes: Record<string, () => Response>,
	token: () => Response = () => json({ access_token: 'tok-1', expires_in: 3600 })
) {
	const calls: Call[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		calls.push({ url, init: init ?? {} });
		if (url.endsWith('/oauth2/token')) return token();
		const route = routes[url];
		if (!route) throw new Error(`unexpected fetch: ${url}`);
		return route();
	});
	return calls;
}

function authCalls(calls: Call[]): Call[] {
	return calls.filter((call) => call.url.endsWith('/oauth2/token'));
}

function apiCalls(calls: Call[]): Call[] {
	return calls.filter((call) => !call.url.endsWith('/oauth2/token'));
}

function headerOf(call: Call, name: string): string | null {
	return new Headers(call.init.headers).get(name);
}

function bodyOf(call: Call): unknown {
	return JSON.parse(call.init.body as string);
}

const PENDING_ORDER = () => json({ data: { order: { status: 'pendente' } } });

beforeEach(() => {
	resetAppmaxTokenCache();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('appmaxHosts', () => {
	it('picks the sandbox hosts when unset', () => {
		expect(appmaxHosts(undefined)).toEqual({ authUrl: SANDBOX_AUTH, apiBaseUrl: SANDBOX_API });
	});

	it('picks the production hosts only on the exact literal "production"', () => {
		expect(appmaxHosts('production')).toEqual({
			authUrl: 'https://auth.appmax.com.br/oauth2/token',
			apiBaseUrl: 'https://api.appmax.com.br',
		});
	});

	it.each(['Production', 'prod', '', ' production', 'sandbox', 'staging'])('fails safe to sandbox for %j', (value) => {
		expect(appmaxHosts(value).apiBaseUrl).toBe(SANDBOX_API);
	});
});

describe('access token', () => {
	it('posts form-encoded client credentials and sends the Bearer token on the API call', async () => {
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/orders/9`]: PENDING_ORDER });

		await getOrder(env, '9');

		const [auth, api] = calls;
		expect(auth.url).toBe(SANDBOX_AUTH);
		expect(auth.init.method).toBe('POST');
		expect(headerOf(auth, 'content-type')).toBe('application/x-www-form-urlencoded');
		expect(String(auth.init.body)).toBe('grant_type=client_credentials&client_id=client-1&client_secret=secret-1');
		expect(headerOf(api, 'authorization')).toBe('Bearer tok-1');
	});

	it('uses the production hosts when APPMAX_ENV is production', async () => {
		const calls = mockAppmax({ 'https://api.appmax.com.br/v1/orders/9': PENDING_ORDER });

		const result = await getOrder({ ...env, APPMAX_ENV: 'production' }, '9');

		expect(result.ok).toBe(true);
		expect(calls[0].url).toBe('https://auth.appmax.com.br/oauth2/token');
	});

	it('reuses a cached token across calls', async () => {
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/orders/9`]: PENDING_ORDER });

		await getOrder(env, '9');
		await getOrder(env, '9');

		expect(authCalls(calls)).toHaveLength(1);
	});

	it('refreshes the token five minutes before it expires', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/orders/9`]: PENDING_ORDER });

		await getOrder(env, '9');
		vi.setSystemTime(new Date('2026-10-09T10:54:00Z')); // inside the 55 min window
		await getOrder(env, '9');
		expect(authCalls(calls)).toHaveLength(1);

		vi.setSystemTime(new Date('2026-10-09T10:55:01Z'));
		await getOrder(env, '9');
		expect(authCalls(calls)).toHaveLength(2);
	});

	it('does not share a cached token between client ids or environments', async () => {
		const calls = mockAppmax({
			[`${SANDBOX_API}/v1/orders/9`]: PENDING_ORDER,
			'https://api.appmax.com.br/v1/orders/9': PENDING_ORDER,
		});

		await getOrder(env, '9');
		await getOrder({ ...env, APPMAX_CLIENT_ID: 'client-2' }, '9');
		await getOrder({ ...env, APPMAX_ENV: 'production' }, '9');

		expect(authCalls(calls)).toHaveLength(3);
	});

	it('does not cache a failed token request', async () => {
		let failing = true;
		const calls = mockAppmax(
			{ [`${SANDBOX_API}/v1/orders/9`]: PENDING_ORDER },
			() => (failing ? new Response(null, { status: 401 }) : json({ access_token: 'tok-2', expires_in: 3600 }))
		);

		expect(await getOrder(env, '9')).toEqual({ ok: false, reason: 'auth_failed' });
		failing = false;
		expect((await getOrder(env, '9')).ok).toBe(true);
		expect(authCalls(calls)).toHaveLength(2);
	});

	it('drops the cached token when the API answers 401, so the next call re-authenticates', async () => {
		let status = 401;
		const calls = mockAppmax({
			[`${SANDBOX_API}/v1/orders/9`]: () => (status === 401 ? new Response(null, { status }) : PENDING_ORDER()),
		});

		expect(await getOrder(env, '9')).toEqual({ ok: false, reason: 'auth_failed' });
		status = 200;
		expect((await getOrder(env, '9')).ok).toBe(true);
		expect(authCalls(calls)).toHaveLength(2);
	});

	it('reports a 5xx from the token endpoint as unavailable', async () => {
		mockAppmax({}, () => new Response(null, { status: 503 }));
		expect(await getOrder(env, '9')).toEqual({ ok: false, reason: 'unavailable' });
	});

	it('reports a network failure of the token endpoint as unavailable', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
		expect(await getOrder(env, '9')).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('createCustomer', () => {
	const params = {
		firstName: 'Maria',
		lastName: 'de Souza Silva',
		email: 'maria@example.com',
		phone: '11987654321',
		document: '12345678909',
		ip: '203.0.113.7',
	};

	it('posts the documented body and maps data.customer.id', async () => {
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/customers`]: () => json({ data: { customer: { id: 4321 } } }) });

		const result = await createCustomer(env, params);

		expect(result).toEqual({ ok: true, customerId: '4321' });
		const call = apiCalls(calls)[0];
		expect(call.init.method).toBe('POST');
		expect(headerOf(call, 'content-type')).toBe('application/json');
		expect(headerOf(call, 'authorization')).toBe('Bearer tok-1');
		expect(bodyOf(call)).toEqual({
			first_name: 'Maria',
			last_name: 'de Souza Silva',
			email: 'maria@example.com',
			phone: '11987654321',
			document_number: '12345678909',
			ip: '203.0.113.7',
		});
	});

	it('reports a response without a customer id as unavailable', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/customers`]: () => json({ data: {} }) });
		expect(await createCustomer(env, params)).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('createOrder', () => {
	it('posts one digital product in cents and maps data.order.id and status', async () => {
		const calls = mockAppmax({
			[`${SANDBOX_API}/v1/orders`]: () => json({ data: { order: { id: 777, status: 'pendente' } } }),
		});

		const result = await createOrder(env, {
			customerId: '4321',
			sku: 'robo-exemplo-a:one_time',
			name: 'Robô Exemplo A',
			amountCents: 49_900,
		});

		expect(result).toEqual({ ok: true, orderId: '777', status: 'pendente' });
		const call = apiCalls(calls)[0];
		expect(call.init.method).toBe('POST');
		expect(bodyOf(call)).toEqual({
			customer_id: '4321',
			products: [{ sku: 'robo-exemplo-a:one_time', name: 'Robô Exemplo A', quantity: 1, unit_value: 49_900, type: 'digital' }],
			shipping_value: 0,
			discount_value: 0,
		});
	});

	it('reports a response without an order id as unavailable', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/orders`]: () => json({ data: { order: {} } }) });
		expect(await createOrder(env, { customerId: '1', sku: 's', name: 'n', amountCents: 500 })).toEqual({
			ok: false,
			reason: 'unavailable',
		});
	});
});

describe('payCreditCard', () => {
	const params = {
		orderId: '777',
		customerId: '4321',
		token: 'card-token-abc',
		holderName: 'MARIA DE SOUZA SILVA',
		holderDocument: '12345678909',
		softDescriptor: 'TRADERBOT',
	};
	const CARD_URL = `${SANDBOX_API}/v1/payments/credit-card`;

	it('posts the documented body with one installment and maps data.order.status', async () => {
		const calls = mockAppmax({ [CARD_URL]: () => json({ data: { order: { id: 777, status: 'autorizado' } } }) });

		const result = await payCreditCard(env, params);

		expect(result).toEqual({ ok: true, orderStatus: 'autorizado' });
		expect(bodyOf(apiCalls(calls)[0])).toEqual({
			order_id: '777',
			customer_id: '4321',
			payment_data: {
				credit_card: {
					token: 'card-token-abc',
					holder_document_number: '12345678909',
					holder_name: 'MARIA DE SOUZA SILVA',
					installments: 1,
					soft_descriptor: 'TRADERBOT',
				},
			},
		});
	});

	it('maps "Payment not authorized" to a distinct not_authorized result', async () => {
		mockAppmax({ [CARD_URL]: () => json({ message: 'Payment not authorized' }, 422) });
		expect(await payCreditCard(env, params)).toEqual({ ok: false, reason: 'not_authorized' });
	});

	it("keeps other 4xx apart as rejected, carrying Appmax's message", async () => {
		mockAppmax({ [CARD_URL]: () => json({ message: 'Invalid token' }, 400) });
		expect(await payCreditCard(env, params)).toEqual({ ok: false, reason: 'rejected', status: 400, message: 'Invalid token' });
	});

	it('reports a 5xx as unavailable', async () => {
		mockAppmax({ [CARD_URL]: () => new Response(null, { status: 502 }) });
		expect(await payCreditCard(env, params)).toEqual({ ok: false, reason: 'unavailable' });
	});

	it('reports a network failure of the payment call as unavailable', async () => {
		mockAppmax({
			[CARD_URL]: () => {
				throw new Error('network down');
			},
		});
		expect(await payCreditCard(env, params)).toEqual({ ok: false, reason: 'unavailable' });
	});

	it('reports a rejected credential as auth_failed', async () => {
		mockAppmax({}, () => new Response(null, { status: 401 }));
		expect(await payCreditCard(env, params)).toEqual({ ok: false, reason: 'auth_failed' });
	});
});

describe('payPix', () => {
	it('posts the document and maps data.pix', async () => {
		const calls = mockAppmax({
			[`${SANDBOX_API}/v1/payments/pix`]: () =>
				json({ data: { pix: { qr_code: 'data:image/png;base64,AAA', emv_code: '000201...', expires_at: '2026-10-10 10:00:00' } } }),
		});

		const result = await payPix(env, { orderId: '777', document: '12345678909' });

		expect(result).toEqual({
			ok: true,
			pix: { qrCode: 'data:image/png;base64,AAA', emvCode: '000201...', expiresAt: '2026-10-10 10:00:00' },
		});
		expect(bodyOf(apiCalls(calls)[0])).toEqual({ order_id: '777', payment_data: { pix: { document_number: '12345678909' } } });
	});

	it('reports a response without the Pix block as unavailable', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/payments/pix`]: () => json({ data: {} }) });
		expect(await payPix(env, { orderId: '777', document: '12345678909' })).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('payBoleto', () => {
	it('posts the document and maps data.boleto', async () => {
		const calls = mockAppmax({
			[`${SANDBOX_API}/v1/payments/boleto`]: () =>
				json({ data: { boleto: { pdf_url: 'https://x/b.pdf', digitable_line: '3419 1234', due_date: '2026-10-13' } } }),
		});

		const result = await payBoleto(env, { orderId: '777', document: '12345678909' });

		expect(result).toEqual({
			ok: true,
			boleto: { pdfUrl: 'https://x/b.pdf', digitableLine: '3419 1234', dueDate: '2026-10-13' },
		});
		expect(bodyOf(apiCalls(calls)[0])).toEqual({ order_id: '777', payment_data: { boleto: { document_number: '12345678909' } } });
	});

	it('reports a response without the Boleto block as unavailable', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/payments/boleto`]: () => json({ data: {} }) });
		expect(await payBoleto(env, { orderId: '777', document: '12345678909' })).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('getOrder', () => {
	const order = {
		data: {
			order: { id: 777, status: 'aprovado', total_paid: 52_000, amounts: { sub_total: 49_900, installment_fee: 2_100 } },
			customer: { name: 'Maria da Silva', email: 'maria@example.com', document_number: '123.456.789-09' },
			payment: { method: 'credit_card' },
		},
	};

	it('GETs /v1/orders/{id} and maps the documented shape', async () => {
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/orders/777`]: () => json(order) });

		const result = await getOrder(env, '777');

		expect(result).toEqual({
			ok: true,
			rawStatus: 'aprovado',
			status: 'active',
			paymentMethod: 'card',
			email: 'maria@example.com',
			buyer: { name: 'Maria da Silva', document: '12345678909' },
			reportedAmountCents: 49_900,
		});
		expect(apiCalls(calls)[0].init.method ?? 'GET').toBe('GET');
	});

	it('reports a 404 as rejected, with no message when the body has none', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/orders/1`]: () => new Response(null, { status: 404 }) });
		expect(await getOrder(env, '1')).toEqual({ ok: false, reason: 'rejected', status: 404, message: null });
	});

	it('reports a response without data.order as unavailable', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/orders/2`]: () => json({ data: {} }) });
		expect(await getOrder(env, '2')).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('fetchAuthoritativeStatus', () => {
	it('reads the order from data.order and keeps sub_total as the reported amount', async () => {
		mockAppmax({
			[`${SANDBOX_API}/v1/orders/777`]: () =>
				json({
					data: {
						order: { id: 777, status: 'pendente', total_paid: 52_000, amounts: { sub_total: 49_900, installment_fee: 2_100 } },
						customer: { name: 'Maria', email: 'maria@example.com', document_number: null },
						payment: { method: 'pix' },
					},
				}),
		});

		expect(await fetchAuthoritativeStatus(env, { orderId: '777', subscriptionId: null })).toEqual({
			ok: true,
			status: 'pending',
			paymentMethod: 'pix',
			email: 'maria@example.com',
			buyer: { name: 'Maria', document: null },
			reportedAmountCents: 49_900,
		});
	});

	it('flags the paid-but-refund-requested review status for the operator', async () => {
		mockAppmax({
			[`${SANDBOX_API}/v1/orders/777`]: () => json({ data: { order: { status: 'pendente_integracao_em_analise' } } }),
		});

		const result = await fetchAuthoritativeStatus(env, { orderId: '777', subscriptionId: null });

		expect(result).toMatchObject({ ok: true, status: 'pending' });
		expect(result.ok && result.operatorReview).toContain('pendente_integracao_em_analise');
	});

	it('GETs /v1/subscriptions/{id} for a subscription, with no customer or amount', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/subscriptions/55`]: () => json({ data: { status: 'ACTIVE' } }) });

		expect(await fetchAuthoritativeStatus(env, { orderId: null, subscriptionId: '55' })).toEqual({
			ok: true,
			status: 'active',
			paymentMethod: null,
			email: null,
			buyer: { name: null, document: null },
			reportedAmountCents: null,
		});
	});

	it('collapses any failure to { ok: false }', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/orders/777`]: () => new Response(null, { status: 500 }) });
		expect(await fetchAuthoritativeStatus(env, { orderId: '777', subscriptionId: null })).toEqual({ ok: false });
	});
});

describe('cancelSubscription', () => {
	it('PATCHes /v1/subscriptions/{id}/cancel', async () => {
		const calls = mockAppmax({ [`${SANDBOX_API}/v1/subscriptions/55/cancel`]: () => json({ data: {} }) });

		expect(await cancelSubscription(env, '55')).toEqual({ ok: true });
		expect(apiCalls(calls)[0].init.method).toBe('PATCH');
	});

	it('returns { ok: false } on a failure', async () => {
		mockAppmax({ [`${SANDBOX_API}/v1/subscriptions/55/cancel`]: () => new Response(null, { status: 502 }) });
		expect(await cancelSubscription(env, '55')).toEqual({ ok: false });
	});
});

describe('logging', () => {
	it('never writes request bodies, card tokens or Appmax messages to the console', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level));
		mockAppmax({
			[`${SANDBOX_API}/v1/payments/credit-card`]: () => json({ message: 'Payment not authorized', cpf: '12345678909' }, 422),
		});

		await payCreditCard(env, {
			orderId: '1',
			customerId: '2',
			token: 'secret-card-token',
			holderName: 'MARIA',
			holderDocument: '12345678909',
			softDescriptor: 'X',
		});

		for (const spy of spies) expect(spy).not.toHaveBeenCalled();
	});
});
