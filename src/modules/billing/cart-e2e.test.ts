import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCatalogCards } from '../../content/catalog-page';
import { cartCheckoutHref, type CartLine } from '../../shared/cart-limits';
import { putLicenseBinary } from '../../../test/robot-binary-fixture';
import { createRobot, emptyRobotForm, getRobotForAdmin, setRobotStatus, toFormInput, updateRobot } from '../catalog/admin';
import { listPublishedWithOffers, lookupOffer } from '../catalog/robots';
import { clearCatalog } from '../catalog/test-helpers';
import { gateAdmin } from '../identity/admin';
import { redeemMagicLink, requestMagicLink } from '../identity/magic-link';
import { listDeadLetters, resendDeadLetter } from '../identity/send-with-dead-letter';
import { resolveAccountView } from '../licensing/account-page';
import { activateLicense } from '../licensing/activate';
import { saveCorretoraAccount } from '../licensing/corretora-account';
import { submitEncomenda } from '../orders/encomenda';
import { resetAppmaxTokenCache } from './appmax-client';
import { readCheckoutQuery, resolveCheckout } from './checkout';
import { pay } from './pay';
import { priceCheckout } from './price-checkout';
import { getPurchaseStatus, getPurchaseView } from './status';
import { handleWebhook } from './webhook';

/**
 * .scratch/storefront-v2/issues/15-end-to-end-verification.md — the storefront-v2 effort in one
 * pass (ADR-0008): an admin publishes a Robô, a price edit reaches the next checkout, a cart with
 * two Licenças of one Robô and one of another is paid in one Appmax order, the webhook activates
 * all three, one Cliente holds three Licenças, each takes its own Corretora account and gets its
 * own download e-mail. Same style as `licensing/catalog-e2e.test.ts`: the real module functions
 * against real D1 and R2, only the outbound Appmax and Resend `fetch` mocked. The pages and
 * browser scripts around these functions are checked in a browser (ticket Comments), not here.
 */

const API = 'https://api.sandboxappmax.com.br';
const ORIGIN = 'https://example.com';
const ADMIN = 'admin-e2e@example.com';
const BUYER = { name: 'Maria de Souza', email: 'Carrinho.E2E@Example.com', phone: '(11) 98765-4321', document: '123.456.789-09' };

type Outbound = {
	orderId: string;
	refetch: { status: string; subTotalCents?: number; method?: string };
	orders: { products: { sku: string; quantity: number; unit_value: number }[] }[];
	payments: string[];
	emails: { to: string[]; subject: string; text: string }[];
	resendStatus: number;
};

let outbound: Outbound;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function mockOutbound(orderId: string): Outbound {
	outbound = { orderId, refetch: { status: 'pendente' }, orders: [], payments: [], emails: [], resendStatus: 200 };
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.endsWith('/oauth2/token')) return json({ access_token: 'e2e-cart-token', expires_in: 3600 });
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		if (url === `${API}/v1/customers`) return json({ data: { customer: { id: 701 } } });
		if (url === `${API}/v1/orders`) {
			outbound.orders.push(body);
			return json({ data: { order: { id: outbound.orderId, status: 'pendente' } } });
		}
		if (url === `${API}/v1/payments/pix`) {
			outbound.payments.push('pix');
			return json({
				data: { pix: { qr_code: 'data:image/png;base64,iVBORw0KGgo=', emv_code: '00020126580014br.gov.bcb.pix', expires_at: '2099-01-01 23:59:59' } },
			});
		}
		if (url === `${API}/v1/orders/${outbound.orderId}`) {
			const { status, subTotalCents, method } = outbound.refetch;
			return json({
				data: {
					order: { id: outbound.orderId, status, amounts: subTotalCents === undefined ? undefined : { sub_total: subTotalCents } },
					payment: { method: method ?? 'pix' },
					customer: { name: 'Maria de Souza', email: BUYER.email, document_number: BUYER.document },
				},
			});
		}
		if (url.includes('api.resend.com')) {
			outbound.emails.push(body);
			return json(outbound.resendStatus === 200 ? { id: 'resend-e2e' } : { name: 'internal_error', message: 'down' }, outbound.resendStatus);
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	return outbound;
}

const payEnv = () =>
	({
		...env,
		APPMAX_CLIENT_ID: 'client-e2e',
		APPMAX_CLIENT_SECRET: 'secret-e2e',
		APPMAX_ENV: 'sandbox',
		PAY_RATE_LIMITER: { limit: async () => ({ success: true }) },
	}) as unknown as Parameters<typeof pay>[0];

const adminEnv = () => ({ ...env, ADMIN_EMAILS: ADMIN }) as unknown as Parameters<typeof gateAdmin>[1];

async function loginCookie(email: string): Promise<string> {
	await requestMagicLink(adminEnv() as never, { email, ip: '203.0.113.30', origin: ORIGIN });
	const row = await env.DB.prepare(
		`SELECT lt.token AS token FROM login_tokens lt JOIN customers c ON c.id = lt.customer_id
		 WHERE c.email = ? ORDER BY lt.created_at DESC LIMIT 1`
	)
		.bind(email)
		.first<{ token: string }>();
	if (row === null) throw new Error(`no login token for ${email}`);
	const redeemed = await redeemMagicLink(env, row.token);
	if (!redeemed.ok) throw new Error('expected the magic link to redeem');
	return redeemed.cookieValue;
}

const withSession = (path: string, cookie: string | null, method = 'GET') =>
	new Request(`${ORIGIN}${path}`, {
		method,
		headers: { ...(cookie === null ? {} : { Cookie: `session=${cookie}` }), ...(method === 'GET' ? {} : { Origin: ORIGIN }) },
	});

/** Every `/admin` route and how it calls `gateAdmin` (src/pages/admin*). */
const ADMIN_ROUTES: { path: string; method: string; checkOrigin: boolean }[] = [
	{ path: '/admin', method: 'GET', checkOrigin: false },
	{ path: '/admin/robos', method: 'GET', checkOrigin: false },
	{ path: '/admin/robos/new', method: 'GET', checkOrigin: true },
	{ path: '/admin/robos/new', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho', method: 'GET', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/status', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/galeria/imagens', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/galeria/video', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/galeria/1/legenda', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/galeria/1/mover', method: 'POST', checkOrigin: true },
	{ path: '/admin/robos/robo-carrinho/galeria/1/remover', method: 'POST', checkOrigin: true },
	{ path: '/admin/emails', method: 'GET', checkOrigin: false },
	{ path: '/admin/emails/resend', method: 'POST', checkOrigin: true },
];

async function adminStatuses(cookie: string | null): Promise<number[]> {
	const statuses: number[] = [];
	for (const route of ADMIN_ROUTES) {
		const gate = await gateAdmin(withSession(route.path, cookie, route.method), adminEnv(), { checkOrigin: route.checkOrigin });
		statuses.push(gate.ok ? 200 : gate.response.status);
	}
	return statuses;
}

const robotForm = (slug: string, prices: { one_time: string; annual: string }) => ({
	...emptyRobotForm,
	slug,
	name: `Robô ${slug}`,
	shortDescription: `Resumo de ${slug}.`,
	longDescription: `Descrição longa de ${slug}.\nSegunda linha.`,
	strategyType: 'Tendência',
	market: 'Mini índice',
	perfil: 'Moderado',
	prices,
});

/** What the admin does: create (always a draft), then publish. */
async function publish(slug: string, prices: { one_time: string; annual: string }) {
	expect(await createRobot(env, robotForm(slug, prices))).toEqual({ ok: true, slug });
	expect(await setRobotStatus(env, slug, 'available')).toEqual({ ok: true });
}

async function rowsOf(checkoutId: string) {
	const { results } = await env.DB.prepare(
		`SELECT p.id, p.robot_id, p.offer, p.amount_cents, p.status, p.customer_id, p.appmax_order_id, l.status AS license_status
		 FROM purchases p LEFT JOIN licenses l ON l.purchase_id = p.id WHERE p.checkout_id = ? ORDER BY p.robot_id, p.id`
	)
		.bind(checkoutId)
		.all<{
			id: string;
			robot_id: string;
			offer: string;
			amount_cents: number;
			status: string;
			customer_id: string | null;
			appmax_order_id: string | null;
			license_status: string | null;
		}>();
	return results;
}

describe('storefront-v2 end to end', { timeout: 120_000 }, () => {
	beforeEach(async () => {
		resetAppmaxTokenCache();
		await clearCatalog();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('admin publishes → catalog and modal show it → price edit reaches checkout → cart of 3 Licenças paid in one order → one Cliente, three Licenças, each with its own account and download e-mail', async () => {
		const out = mockOutbound('ord_e2e_cart');

		// 1. The admin creates a Robô (always a draft) and publishes it, plus a second one.
		await publish('robo-carrinho', { one_time: '997,00', annual: '497,00' });
		await publish('robo-outro', { one_time: '1.497,00', annual: '' });

		// 2. The public catalog has its card, and the "Saiba mais" modal content (long text, both prices).
		const cards = buildCatalogCards(await listPublishedWithOffers(env));
		const card = cards.find((c) => c.slug === 'robo-carrinho');
		expect(card).toMatchObject({
			name: 'Robô robo-carrinho',
			longDescription: 'Descrição longa de robo-carrinho.\nSegunda linha.',
			offers: [
				{ offer: 'one_time', amountCents: 99_700 },
				{ offer: 'annual', amountCents: 49_700 },
			],
		});

		// 3. A price edit applies to the next checkout.
		const stored = await getRobotForAdmin(env, 'robo-carrinho');
		const form = toFormInput(stored!);
		expect(await updateRobot(env, 'robo-carrinho', { ...form, prices: { ...form.prices, one_time: '1.097,00' } })).toEqual({
			ok: true,
			slug: 'robo-carrinho',
		});

		// 4. The cart page's link: two Licenças of one Robô and one of another.
		const cart: CartLine[] = [
			{ robot: 'robo-carrinho', offer: 'one_time', quantity: 2 },
			{ robot: 'robo-outro', offer: 'one_time', quantity: 1 },
		];
		const checkout = await resolveCheckout(env, readCheckoutQuery(new URL(cartCheckoutHref(cart), ORIGIN)));
		if (checkout.kind !== 'form') throw new Error(`expected the checkout form, got ${checkout.kind}`);
		expect(checkout.amountCents).toBe(2 * 109_700 + 149_700);
		expect(checkout.fromCart).toBe(true);

		// 5. Pay by Pix: three pending rows, one Appmax order with one product per line.
		const paid = await pay(payEnv(), {
			body: { reference: checkout.reference, lines: cart, method: 'pix', buyer: BUYER },
			ip: '203.0.113.30',
		});
		expect(paid).toEqual({ ok: true, redirectUrl: `/checkout/confirmacao?ref=${checkout.reference}` });
		expect(out.orders).toHaveLength(1);
		expect(out.orders[0].products).toMatchObject([
			{ sku: 'robo-carrinho:one_time', quantity: 2, unit_value: 109_700 },
			{ sku: 'robo-outro:one_time', quantity: 1, unit_value: 149_700 },
		]);
		expect(out.payments).toEqual(['pix']);
		let rows = await rowsOf(checkout.reference);
		expect(rows.map((r) => [r.robot_id, r.amount_cents, r.status])).toEqual([
			['robo-carrinho', 109_700, 'pending'],
			['robo-carrinho', 109_700, 'pending'],
			['robo-outro', 149_700, 'pending'],
		]);
		expect(rows.every((r) => r.appmax_order_id === 'ord_e2e_cart')).toBe(true);

		// 6. The confirmation page: one Pix for the whole order, every Robô listed.
		const pending = await getPurchaseView(env, checkout.reference);
		expect(pending).toMatchObject({
			ok: true,
			view: {
				state: 'awaiting_pix',
				instructions: { kind: 'pix' },
				items: expect.arrayContaining([
					{ robotId: 'robo-carrinho', offer: 'one_time', quantity: 2 },
					{ robotId: 'robo-outro', offer: 'one_time', quantity: 1 },
				]),
			},
		});

		// 7. The webhook: the order total matches the sum of the rows, so all three activate.
		out.refetch = { status: 'aprovado', subTotalCents: 2 * 109_700 + 149_700 };
		expect(await handleWebhook(payEnv() as never, JSON.stringify({ event: 'order_paid_by_pix', data: { order_id: 'ord_e2e_cart' } }))).toEqual({
			status: 200,
		});
		expect(await getPurchaseStatus(env, checkout.reference)).toEqual({ ok: true, state: 'active' });
		rows = await rowsOf(checkout.reference);
		expect(rows.map((r) => r.status)).toEqual(['active', 'active', 'active']);
		expect(rows.map((r) => r.license_status)).toEqual(['awaiting_account', 'awaiting_account', 'awaiting_account']);
		expect(new Set(rows.map((r) => r.customer_id)).size).toBe(1);
		const loginEmails = out.emails.filter((e) => e.to.some((to) => to.toLowerCase() === 'carrinho.e2e@example.com'));
		expect(loginEmails).toHaveLength(1);

		// 8. /conta: three Licenças for one Cliente, two under the same Robô, each asking for its account.
		const cookie = await loginCookie('carrinho.e2e@example.com');
		const account = await resolveAccountView(env, withSession('/conta', cookie));
		if (!account.ok) throw new Error('expected the account view');
		expect(account.robots.map((group) => [group.robotName, group.licenses.length]).sort()).toEqual([
			['Robô robo-carrinho', 2],
			['Robô robo-outro', 1],
		]);
		const licenses = account.robots.flatMap((group) => group.licenses);
		expect(licenses.every((l) => l.license.status === 'awaiting_account' && l.corretoraAccount === null)).toBe(true);

		// 9. Each Licença takes its own Corretora account, is compiled and activated on its own,
		//    and gets its own download e-mail naming its Robô and account.
		const accounts = ['1111111', '2222222', '3333333'];
		for (const [index, row] of rows.entries()) {
			expect(await saveCorretoraAccount(env, row.id, accounts[index])).toEqual({ ok: true });
		}
		expect(await saveCorretoraAccount(env, rows[0].id, '9999999')).toEqual({ ok: false, reason: 'already_set' });
		out.emails = [];
		const downloadUrls: string[] = [];
		for (const row of rows) {
			await putLicenseBinary(row.id);
			const activated = await activateLicense(env, { licenseId: row.id, origin: ORIGIN });
			if (!activated.ok) throw new Error(`activation failed: ${activated.reason}`);
			downloadUrls.push(activated.downloadUrl);
		}
		expect(new Set(downloadUrls).size).toBe(3);
		expect(out.emails).toHaveLength(3);
		for (const [index, email] of out.emails.entries()) {
			expect(email.text).toContain(accounts[index]);
			expect(email.text).toContain(downloadUrls[index]);
			expect(email.subject).toContain(rows[index].robot_id === 'robo-outro' ? 'Robô robo-outro' : 'Robô robo-carrinho');
		}

		// 10. The Cliente is not an admin: every /admin route is a 404; the admin passes.
		expect(await adminStatuses(cookie)).toEqual(ADMIN_ROUTES.map(() => 404));
		const adminCookie = await loginCookie(ADMIN);
		expect(await adminStatuses(adminCookie)).toEqual(ADMIN_ROUTES.map(() => 200));
	});

	it('a draft or archived Robô cannot be priced; a cart with a tampered price or a Mensal line is refused; anonymous gets 404 on /admin', async () => {
		mockOutbound('ord_e2e_refused');
		await publish('robo-arquivado', { one_time: '500,00', annual: '' });
		expect(await setRobotStatus(env, 'robo-arquivado', 'archived')).toEqual({ ok: true });
		expect(await createRobot(env, robotForm('robo-rascunho', { one_time: '100', annual: '' }))).toEqual({ ok: true, slug: 'robo-rascunho' });
		await publish('robo-valido', { one_time: '300,00', annual: '150,00' });

		for (const slug of ['robo-rascunho', 'robo-arquivado']) {
			expect((await lookupOffer(env, slug, 'one_time')).kind).toBe('unknown_robot');
			expect(await priceCheckout(env, [{ robotId: slug, offer: 'one_time', quantity: 1 }])).toMatchObject({ ok: false, reason: 'unknown_robot' });
		}

		const tamperedRef = crypto.randomUUID();
		const tampered = await pay(payEnv(), {
			body: {
				reference: tamperedRef,
				lines: [{ robot: 'robo-valido', offer: 'one_time', quantity: 1, unitCents: 1, price: 1 }],
				amountCents: 1,
				method: 'pix',
				buyer: BUYER,
			},
			ip: '203.0.113.31',
		});
		expect(tampered.ok).toBe(true);
		expect(outbound.orders[0].products[0].unit_value).toBe(30_000);
		expect((await rowsOf(tamperedRef)).map((r) => r.amount_cents)).toEqual([30_000]);

		const mensalRef = crypto.randomUUID();
		const mensal = await pay(payEnv(), {
			body: {
				reference: mensalRef,
				lines: [
					{ robot: 'robo-valido', offer: 'one_time', quantity: 1 },
					{ robot: 'robo-valido', offer: 'monthly', quantity: 1 },
				],
				method: 'pix',
				buyer: BUYER,
			},
			ip: '203.0.113.31',
		});
		expect(mensal).toEqual({ ok: false, status: 400, code: 'offer_not_supported' });
		expect(await rowsOf(mensalRef)).toHaveLength(0);

		expect(await adminStatuses(null)).toEqual(ADMIN_ROUTES.map(() => 404));
	});

	it('an Encomenda whose e-mail fails lands in the dead letter and the admin resends it', async () => {
		const out = mockOutbound('ord_e2e_unused');
		out.resendStatus = 500;
		const submitted = await submitEncomenda(
			{
				...env,
				ORDER_NOTIFY_EMAIL: 'ops-e2e@example.com',
				WHATSAPP_NUMBER: '5511912345678',
				ENCOMENDA_RATE_LIMITER: { limit: async () => ({ success: true }) },
			} as never,
			{
				fields: {
					name: 'Joana Lima',
					email: 'joana@example.com',
					phone: '',
					strategy: 'Ajustar o stop do meu Robô para 150 pontos.',
					market: 'Mini dólar',
					corretora: 'XP',
					consent: 'on',
				},
				ip: '203.0.113.32',
			}
		);
		expect(submitted.ok).toBe(true);

		const parked = (await listDeadLetters(env)).unresolved.find((row) => row.toAddress === 'ops-e2e@example.com');
		if (parked === undefined) throw new Error('expected the failed Encomenda e-mail in the dead letter');
		expect(parked).toMatchObject({ kind: 'encomenda', resendable: true, replyTo: 'joana@example.com' });

		// The resend lease (a few seconds) has passed; Resend is back.
		await env.DB.prepare("UPDATE email_dead_letters SET last_attempt_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(parked.id).run();
		out.resendStatus = 200;
		out.emails = [];
		expect(await resendDeadLetter(env, parked.id)).toMatchObject({ ok: true });
		expect(out.emails).toHaveLength(1);
		expect(out.emails[0].text).toContain('Ajustar o stop do meu Robô para 150 pontos.');
		expect((await listDeadLetters(env)).unresolved.find((row) => row.id === parked.id)).toBeUndefined();
	});
});
