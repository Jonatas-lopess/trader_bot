import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROBOT_BINARY_BYTES, putLicenseBinary } from '../../../test/robot-binary-fixture';
import { cancelSubscription } from '../billing/cancel';
import { lookupOffer } from '../catalog/robots';
import { clearCatalog, seedRobot } from '../catalog/test-helpers';
import { resolveCheckout } from '../billing/checkout';
import { getPurchaseStatus } from '../billing/status';
import { handleWebhook } from '../billing/webhook';
import { redeemMagicLink, requestMagicLink } from '../identity/magic-link';
import { resolveAccountView } from './account-page';
import { activateLicense } from './activate';
import { saveCorretoraAccount } from './corretora-account';
import { resolveDownload } from './download';

/**
 * .scratch/catalog-pivot/issues/12-end-to-end-verification.md — /catalog checkout to a
 * downloaded per-Licença binary, plus the four branches (Boleto pending, amount-mismatch
 * `rejected`, Mensal cancel, refund revokes).
 *
 * "Playwright" in the ticket follows this repo's resolved precedent (see
 * `identity/e2e.test.ts`): no browser dependency exists, so this drives the real module
 * functions against real D1 and R2, mocking only the outbound Appmax and Resend `fetch`.
 * The Appmax driver stands in for Stripe's test driver here because the webhook, amount
 * check and provisioning paths are identical past the driver seam.
 */

type OrderResponse = {
	status: string;
	paymentMethod?: string;
	email?: string;
	subTotalCents?: number;
};

let orderResponse: OrderResponse = { status: 'pendente' };
let emailedBodies: string[] = [];

function mockOutbound(orderId: string) {
	emailedBodies = [];
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/oauth2/token')) {
			return new Response(JSON.stringify({ access_token: 'e2e-catalog-token' }), { status: 200 });
		}
		if (url.includes(`/orders/${orderId}`)) {
			return new Response(
				JSON.stringify({
					data: {
						order: {
							status: orderResponse.status,
							amounts:
								orderResponse.subTotalCents === undefined
									? undefined
									: { sub_total: orderResponse.subTotalCents, installment_fee: 0 },
						},
						payment: { method: orderResponse.paymentMethod ?? 'pix' },
						customer: { name: 'Maria da Silva', email: orderResponse.email, document_number: '123.456.789-09' },
					},
				}),
				{ status: 200 }
			);
		}
		if (url.includes('api.resend.com')) {
			emailedBodies.push(String(init?.body));
			return new Response(JSON.stringify({ id: 'resend-e2e' }), { status: 200 });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

async function startCheckout(orderId: string, offer: 'one_time') {
	// The own-form checkout (ADR-0007) writes no row; the pay endpoint writes it with
	// `id = reference` and the Appmax order id. Set up directly here.
	const checkout = await resolveCheckout(env, { robotId: 'robo-exemplo-a', offer, origin: 'https://example.com' });
	if (checkout.kind !== 'form') throw new Error('expected the own checkout form');
	await env.DB.prepare(
		"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, provider, appmax_order_id) VALUES (?, ?, ?, ?, 'pending', 'appmax', ?)"
	)
		.bind(checkout.reference, checkout.robotId, checkout.offer, checkout.amountCents, orderId)
		.run();
	const row = await env.DB.prepare('SELECT id, amount_cents FROM purchases WHERE appmax_order_id = ?')
		.bind(orderId)
		.first<{ id: string; amount_cents: number }>();
	if (row === null) throw new Error('checkout wrote no purchase row');
	return row;
}

async function catalogPrice(offer: 'one_time'): Promise<number> {
	const priced = await lookupOffer(env, 'robo-exemplo-a', offer);
	if (priced.kind !== 'found') throw new Error('robo-exemplo-a must offer ' + offer);
	return priced.amountCents;
}

async function loginCookie(email: string): Promise<string> {
	await requestMagicLink(env, { email, ip: '203.0.113.20', origin: 'https://example.com' });
	const row = await env.DB.prepare(
		`SELECT lt.token AS token FROM login_tokens lt JOIN customers c ON c.id = lt.customer_id
		 WHERE c.email = ? ORDER BY lt.created_at DESC LIMIT 1`
	)
		.bind(email)
		.first<{ token: string }>();
	if (row === null) throw new Error(`no login token for ${email}`);
	const redeemed = await redeemMagicLink(env, row.token);
	if (!redeemed.ok) throw new Error('expected magic link redeem to succeed');
	return redeemed.cookieValue;
}

const accountRequest = (cookie: string) =>
	new Request('https://example.com/conta', { headers: { Cookie: `session=${cookie}` } });

async function licenseOf(purchaseId: string) {
	return env.DB.prepare('SELECT status, corretora_account, expires_at FROM licenses WHERE purchase_id = ?')
		.bind(purchaseId)
		.first<{ status: string; corretora_account: number | null; expires_at: string }>();
}

// The happy path alone takes ~14s cold (it walks the whole purchase → download chain) and
// overruns the 15s default when the full suite loads the pool.
describe('catalog-pivot end to end', { timeout: 60_000 }, () => {
	beforeEach(async () => {
		await clearCatalog();
		await seedRobot({ slug: 'robo-exemplo-a', offers: { one_time: 99700 } });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: checkout → paid webhook → awaiting_account → Corretora → preparing → activate → download → refund 404s the link', async () => {
		const orderId = 'ord_cat_happy';
		mockOutbound(orderId);
		const email = 'compra-happy@example.com';

		// 1. Checkout takes robot + offer only; the price comes from the catalog and is stored.
		const purchase = await startCheckout(orderId, 'one_time');
		expect(purchase.amount_cents).toBe(await catalogPrice('one_time'));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'pending' });

		// 2. Paid webhook: amount matches → active, buyer fiscal data and paid_at persisted.
		orderResponse = { status: 'aprovado', email, subTotalCents: purchase.amount_cents };
		expect(await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }))).toEqual({ status: 200 });
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'active' });
		const paid = await env.DB.prepare('SELECT buyer_name, buyer_document, paid_at FROM purchases WHERE id = ?')
			.bind(purchase.id)
			.first<{ buyer_name: string | null; buyer_document: string | null; paid_at: string | null }>();
		expect(paid?.buyer_name).toBe('Maria da Silva');
		expect(paid?.buyer_document).toBe('12345678909');
		expect(paid?.paid_at).not.toBeNull();

		// 3. Licença exists, awaiting the Corretora account; Compra is perpetual.
		expect(await licenseOf(purchase.id)).toMatchObject({
			status: 'awaiting_account',
			corretora_account: null,
			expires_at: '9999-12-31T23:59:59.000Z',
		});
		const cookie = await loginCookie(email);
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({
			ok: true,
			robots: [{ licenses: [{ canCancel: false, license: { status: 'awaiting_account' } }] }],
		});

		// 4. Nothing can go live before the account is bound.
		expect(await activateLicense(env, { licenseId: purchase.id, origin: 'https://example.com' })).toEqual({
			ok: false,
			reason: 'binary_missing',
		});

		// 5. Corretora form → preparing.
		expect(await saveCorretoraAccount(env, purchase.id, '1234567')).toEqual({ ok: true });
		expect(await licenseOf(purchase.id)).toMatchObject({ status: 'preparing', corretora_account: 1234567 });
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({ robots: [{ licenses: [{ license: { status: 'preparing' } }] }] });

		// 6. Operator compiles, uploads licenses/<id>.ex5, flips active and the link is emailed.
		await putLicenseBinary(purchase.id);
		const activated = await activateLicense(env, { licenseId: purchase.id, origin: 'https://example.com' });
		expect(activated.ok).toBe(true);
		if (!activated.ok) throw new Error('expected activation to succeed');
		expect((await licenseOf(purchase.id))?.status).toBe('active');
		expect(emailedBodies.some((body) => body.includes(activated.downloadUrl))).toBe(true);

		// 7. Redeem the emailed link: the bytes are this Licença's binary.
		const token = /\/download\/([^/?#]+)/.exec(activated.downloadUrl)?.[1];
		if (token === undefined) throw new Error('no token in download url');
		const download = await resolveDownload(env, token);
		expect(download.ok).toBe(true);
		if (!download.ok) throw new Error('expected download to succeed');
		expect(new Uint8Array(await new Response(download.body).arrayBuffer())).toEqual(ROBOT_BINARY_BYTES);

		// 8. Refund (7-day withdrawal): the already-minted link stops working.
		orderResponse = { status: 'estornado', email, subTotalCents: purchase.amount_cents };
		await handleWebhook(env, JSON.stringify({ event: 'order_refund', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'refunded' });
		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({ robots: [{ licenses: [{ license: { status: 'revoked' } }] }] });
	});

	it('boleto branch: pending shows the awaiting state and no Licença, then paid provisions it', async () => {
		const orderId = 'ord_cat_boleto';
		mockOutbound(orderId);
		const purchase = await startCheckout(orderId, 'one_time');

		orderResponse = { status: 'pendente', paymentMethod: 'boleto' };
		await handleWebhook(env, JSON.stringify({ event: 'order_billet_created', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'awaiting_boleto' });
		expect(await licenseOf(purchase.id)).toBeNull();

		orderResponse = {
			status: 'aprovado',
			paymentMethod: 'boleto',
			email: 'compra-boleto@example.com',
			subTotalCents: purchase.amount_cents,
		};
		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'active' });
		expect((await licenseOf(purchase.id))?.status).toBe('awaiting_account');
	});

	it('amount mismatch: the charged amount differs from the stored one → rejected, no Licença, no Cliente, no binary path', async () => {
		const orderId = 'ord_cat_mismatch';
		mockOutbound(orderId);
		const purchase = await startCheckout(orderId, 'one_time');

		orderResponse = { status: 'aprovado', email: 'compra-mismatch@example.com', subTotalCents: purchase.amount_cents - 1 };
		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }));

		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'rejected' });
		expect(await licenseOf(purchase.id)).toBeNull();
		expect(await env.DB.prepare('SELECT c.id FROM customers c JOIN purchases p ON p.customer_id = c.id WHERE p.id = ?').bind(purchase.id).first()).toBeNull();
		expect(await saveCorretoraAccount(env, purchase.id, '1234567')).toEqual({ ok: false, reason: 'no_license' });
	});

	it('mensal (standby, existing subscription): activates, /conta offers cancel, cancel flips it and keeps the Licença row', async () => {
		const orderId = 'ord_cat_mensal';
		mockOutbound(orderId);
		const email = 'compra-mensal@example.com';
		// Mensal is on standby (ADR-0008): the catalog no longer sells it, so there is no
		// checkout to start. The row is seeded as an existing subscription would be.
		const purchase = { id: 'cat-mensal', amount_cents: 9700 };
		await env.DB.prepare(
			"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, appmax_order_id, appmax_subscription_id) VALUES (?, 'robo-exemplo-a', 'monthly', ?, 'pending', ?, 'asub_cat_mensal')"
		)
			.bind(purchase.id, purchase.amount_cents, orderId)
			.run();

		orderResponse = { status: 'aprovado', paymentMethod: 'cartao', email, subTotalCents: purchase.amount_cents };
		await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'active' });

		const cookie = await loginCookie(email);
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({ ok: true, robots: [{ licenses: [{ canCancel: true }] }] });

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
			if (url.includes('/subscriptions/asub_cat_mensal/cancel')) return new Response(null, { status: 200 });
			throw new Error(`unexpected fetch: ${url}`);
		});
		expect(
			await cancelSubscription(env, {
				purchaseId: purchase.id,
				provider: 'appmax',
				providerSubscriptionId: 'asub_cat_mensal',
			})
		).toEqual({ ok: true });
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({
			ok: true,
			robots: [{ licenses: [{ canCancel: false, subscriptionStatus: 'canceled' }] }],
		});
		expect(await licenseOf(purchase.id)).not.toBeNull();
	});

	// ADR-0008: the one-Licença-per-Cliente-per-Robô rule is gone; a second Licença is the way
	// to run the same Robô on a second Corretora account.
	it('repeat purchase: the same email buys the same Robô twice and gets two independent Licenças', async () => {
		const email = 'compra-repeat@example.com';
		const purchases: { id: string; amount: number }[] = [];
		for (const orderId of ['ord_cat_repeat_1', 'ord_cat_repeat_2']) {
			mockOutbound(orderId);
			const purchase = await startCheckout(orderId, 'one_time');
			orderResponse = { status: 'aprovado', email, subTotalCents: purchase.amount_cents };
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }));
			expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'active' });
			purchases.push({ id: purchase.id, amount: purchase.amount_cents });
		}
		const [first, second] = purchases;

		// One Cliente, two Licenças of one Robô, both on /conta and distinguishable by their own account.
		const customers = await env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind(email).all();
		expect(customers.results).toHaveLength(1);
		expect(first.id).not.toBe(second.id);
		expect((await licenseOf(first.id))?.status).toBe('awaiting_account');
		expect((await licenseOf(second.id))?.status).toBe('awaiting_account');

		// Each Licença takes its own Corretora account.
		expect(await saveCorretoraAccount(env, first.id, '1111111')).toEqual({ ok: true });
		expect(await saveCorretoraAccount(env, second.id, '2222222')).toEqual({ ok: true });
		const cookie = await loginCookie(email);
		const view = await resolveAccountView(env, accountRequest(cookie));
		expect(view).toMatchObject({
			ok: true,
			robots: [
				{
					robotName: 'Robô robo-exemplo-a',
					licenses: [
						{ purchaseId: first.id, corretoraAccount: 1111111 },
						{ purchaseId: second.id, corretoraAccount: 2222222 },
					],
				},
			],
		});

		// Each Licença is activated and mailed its own download link.
		const tokens: string[] = [];
		for (const purchase of purchases) {
			await putLicenseBinary(purchase.id);
			const activated = await activateLicense(env, { licenseId: purchase.id, origin: 'https://example.com' });
			if (!activated.ok) throw new Error('expected activation to succeed');
			tokens.push(/\/download\/([^/?#]+)/.exec(activated.downloadUrl)![1]);
		}
		expect(tokens[0]).not.toBe(tokens[1]);

		// Revoking one Licença (refund of its order) leaves the other's link working.
		mockOutbound('ord_cat_repeat_1');
		orderResponse = { status: 'estornado', email, subTotalCents: first.amount };
		await handleWebhook(env, JSON.stringify({ event: 'order_refund', order_id: 'ord_cat_repeat_1' }));
		expect(await resolveDownload(env, tokens[0])).toEqual({ ok: false, status: 404 });
		expect((await resolveDownload(env, tokens[1])).ok).toBe(true);
	});

	it('repeat purchase: canceling one Mensal leaves the other Mensal of the same Robô cancelable', async () => {
		const email = 'compra-repeat-mensal@example.com';
		const purchases: { id: string }[] = [];
		for (const n of [1, 2]) {
			const orderId = `ord_cat_repeat_m${n}`;
			mockOutbound(orderId);
			// Mensal is on standby (ADR-0008): no checkout sells it, so seed existing subscriptions.
			const purchase = { id: `cat-repeat-m${n}`, amount_cents: 9700 };
			await env.DB.prepare(
				"INSERT INTO purchases (id, robot_id, offer, amount_cents, status, appmax_order_id, appmax_subscription_id) VALUES (?, 'robo-exemplo-a', 'monthly', ?, 'pending', ?, ?)"
			)
				.bind(purchase.id, purchase.amount_cents, orderId, `asub_cat_repeat_m${n}`)
				.run();
			orderResponse = { status: 'aprovado', paymentMethod: 'cartao', email, subTotalCents: purchase.amount_cents };
			await handleWebhook(env, JSON.stringify({ event: 'order_approved', order_id: orderId }));
			purchases.push(purchase);
		}

		const cookie = await loginCookie(email);
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
			if (url.includes('/subscriptions/asub_cat_repeat_m1/cancel')) return new Response(null, { status: 200 });
			throw new Error(`unexpected fetch: ${url}`);
		});
		expect(
			await cancelSubscription(env, {
				purchaseId: purchases[0].id,
				provider: 'appmax',
				providerSubscriptionId: 'asub_cat_repeat_m1',
			})
		).toEqual({ ok: true });

		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({
			ok: true,
			robots: [
				{
					licenses: [
						{ purchaseId: purchases[0].id, canCancel: false, subscriptionStatus: 'canceled' },
						{ purchaseId: purchases[1].id, canCancel: true, subscriptionStatus: 'active' },
					],
				},
			],
		});
	});
});
