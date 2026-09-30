import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupOffer } from '../../content/catalog';
import { ROBOT_BINARY_BYTES, putLicenseBinary } from '../../../test/robot-binary-fixture';
import { cancelSubscription } from '../billing/cancel';
import { createCheckoutSession } from '../billing/checkout';
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
		if (url.includes('/payment-links')) {
			return new Response(
				JSON.stringify({ data: { url: `https://checkout.sandboxappmax.com.br/pay/${orderId}`, order_id: orderId } }),
				{ status: 200 }
			);
		}
		if (url.includes(`/orders/${orderId}`)) {
			return new Response(
				JSON.stringify({
					data: {
						status: orderResponse.status,
						payment_method: orderResponse.paymentMethod ?? 'pix',
						email: orderResponse.email,
						customer: { name: 'Maria da Silva', email: orderResponse.email, document_number: '123.456.789-09' },
						amounts:
							orderResponse.subTotalCents === undefined
								? undefined
								: { sub_total: orderResponse.subTotalCents, installment_fee: 0 },
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

async function startCheckout(orderId: string, offer: 'one_time' | 'monthly') {
	const checkout = await createCheckoutSession(env, { robotId: 'robo-exemplo-a', offer, origin: 'https://example.com' });
	expect(checkout.ok).toBe(true);
	const row = await env.DB.prepare('SELECT id, amount_cents FROM purchases WHERE appmax_order_id = ?')
		.bind(orderId)
		.first<{ id: string; amount_cents: number }>();
	if (row === null) throw new Error('checkout wrote no purchase row');
	return row;
}

function catalogPrice(offer: 'one_time' | 'monthly'): number {
	const priced = lookupOffer('robo-exemplo-a', offer);
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
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: checkout → paid webhook → awaiting_account → Corretora → preparing → activate → download → refund 404s the link', async () => {
		const orderId = 'ord_cat_happy';
		mockOutbound(orderId);
		const email = 'compra-happy@example.com';

		// 1. Checkout takes robot + offer only; the price comes from the catalog and is stored.
		const purchase = await startCheckout(orderId, 'one_time');
		expect(purchase.amount_cents).toBe(catalogPrice('one_time'));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'pending' });

		// 2. Paid webhook: amount matches → active, buyer fiscal data and paid_at persisted.
		orderResponse = { status: 'aprovado', email, subTotalCents: purchase.amount_cents };
		expect(await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: orderId }))).toEqual({ status: 200 });
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
		await handleWebhook(env, JSON.stringify({ event: 'order.refunded', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'refunded' });
		expect(await resolveDownload(env, token)).toEqual({ ok: false, status: 404 });
		expect(await resolveAccountView(env, accountRequest(cookie))).toMatchObject({ robots: [{ licenses: [{ license: { status: 'revoked' } }] }] });
	});

	it('boleto branch: pending shows the awaiting state and no Licença, then paid provisions it', async () => {
		const orderId = 'ord_cat_boleto';
		mockOutbound(orderId);
		const purchase = await startCheckout(orderId, 'one_time');

		orderResponse = { status: 'pendente', paymentMethod: 'boleto' };
		await handleWebhook(env, JSON.stringify({ event: 'order.created', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'awaiting_boleto' });
		expect(await licenseOf(purchase.id)).toBeNull();

		orderResponse = {
			status: 'aprovado',
			paymentMethod: 'boleto',
			email: 'compra-boleto@example.com',
			subTotalCents: purchase.amount_cents,
		};
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: orderId }));
		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'active' });
		expect((await licenseOf(purchase.id))?.status).toBe('awaiting_account');
	});

	it('amount mismatch: the charged amount differs from the stored one → rejected, no Licença, no Cliente, no binary path', async () => {
		const orderId = 'ord_cat_mismatch';
		mockOutbound(orderId);
		const purchase = await startCheckout(orderId, 'one_time');

		orderResponse = { status: 'aprovado', email: 'compra-mismatch@example.com', subTotalCents: purchase.amount_cents - 1 };
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: orderId }));

		expect(await getPurchaseStatus(env, purchase.id)).toEqual({ ok: true, state: 'rejected' });
		expect(await licenseOf(purchase.id)).toBeNull();
		expect(await env.DB.prepare('SELECT c.id FROM customers c JOIN purchases p ON p.customer_id = c.id WHERE p.id = ?').bind(purchase.id).first()).toBeNull();
		expect(await saveCorretoraAccount(env, purchase.id, '1234567')).toEqual({ ok: false, reason: 'no_license' });
	});

	it('mensal: card-only recurring purchase activates, /conta offers cancel, cancel flips it and keeps the Licença row', async () => {
		const orderId = 'ord_cat_mensal';
		mockOutbound(orderId);
		const email = 'compra-mensal@example.com';
		const purchase = await startCheckout(orderId, 'monthly');
		expect(purchase.amount_cents).toBe(catalogPrice('monthly'));
		await env.DB.prepare('UPDATE purchases SET appmax_subscription_id = ? WHERE id = ?')
			.bind('asub_cat_mensal', purchase.id)
			.run();

		orderResponse = { status: 'aprovado', paymentMethod: 'cartao', email, subTotalCents: purchase.amount_cents };
		await handleWebhook(env, JSON.stringify({ event: 'order.paid', order_id: orderId }));
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
});
