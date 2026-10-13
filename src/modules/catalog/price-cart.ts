/**
 * Cart pricing — .scratch/storefront-v2/issues/09-cart-page.md, ADR-0008.
 *
 * The browser's cart holds `{robot, offer, quantity}` and never a price (src/shared/cart-store.ts).
 * `POST /cart/summary` turns those lines into display prices read from D1: `parseCartLines`
 * validates the untrusted body, `priceCart` (pure) prices it against the published catalog, and
 * `summarizeCart` is the endpoint's whole logic so it is testable without a route. Prices on the
 * cart page are display only: checkout (ticket 11) prices the lines again with `priceCart`, and
 * the purchase snapshots what it read then (ADR-0006).
 *
 * No price in the request is ever read: a line's fields are picked, not spread.
 */

import { MAX_LINE_QUANTITY, MAX_LINES } from '../billing/price-checkout';
import { listPublishedWithOffers, type OfferName, type PublishedRobot } from './robots';

// The caps are checkout's own (modules/billing/price-checkout.ts), so a cart this endpoint
// accepts is never one checkout rejects for size.
export { MAX_LINE_QUANTITY };

type SummaryEnv = Pick<Cloudflare.Env, 'DB' | 'CART_RATE_LIMITER'>;

export const MAX_CART_LINES = MAX_LINES;
const MAX_BODY_CHARS = 8192;
const MAX_SLUG_LENGTH = 64;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CART_OFFERS: readonly OfferName[] = ['one_time', 'annual'];

export const isCartSlug = (value: unknown): value is string =>
	typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);

export const isCartOffer = (value: unknown): value is OfferName => CART_OFFERS.includes(value as OfferName);

export type CartInputLine = { robot: string; offer: OfferName; quantity: number };

export type ParseCartResult = { ok: true; lines: CartInputLine[] } | { ok: false };

/** Validates an untrusted `{lines: [...]}`; anything off is `{ok: false}` (the endpoint's 400). */
export const parseCartLines = (body: unknown): ParseCartResult => {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false };
	const raw = (body as { lines?: unknown }).lines;
	if (!Array.isArray(raw) || raw.length > MAX_CART_LINES) return { ok: false };

	const lines: CartInputLine[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) return { ok: false };
		const { robot, offer, quantity } = item as Record<string, unknown>;
		if (!isCartSlug(robot) || !isCartOffer(offer)) return { ok: false };
		if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
			return { ok: false };
		}
		// A line is Robô + Oferta; the client merges repeats into one, so a repeat is tampering.
		if (lines.some((l) => l.robot === robot && l.offer === offer)) return { ok: false };
		lines.push({ robot, offer, quantity });
	}
	return { ok: true, lines };
};

/** A priced line. `name` and the cents are null when the line cannot be bought. */
export type PricedLine = CartInputLine & {
	/** The Robô's name when it is published (public anyway); null for unknown, draft and archived. */
	name: string | null;
	unitCents: number | null;
	lineCents: number | null;
	available: boolean;
};

export type CartSummary = { lines: PricedLine[]; totalCents: number };

/**
 * Prices `lines` against the published catalog (`listPublishedWithOffers`). A line is available
 * only when its Robô is `available` and sells that Oferta; a coming-soon, draft, archived,
 * unknown or no-longer-offered line has no price and is left out of the total.
 */
export const priceCart = (lines: CartInputLine[], published: PublishedRobot[]): CartSummary => {
	const bySlug = new Map(published.map((robot) => [robot.slug, robot]));
	const priced = lines.map((line): PricedLine => {
		const robot = bySlug.get(line.robot);
		const sold = robot?.status === 'available' ? robot.offers.find((o) => o.offer === line.offer) : undefined;
		if (!sold) {
			return { ...line, name: robot?.name ?? null, unitCents: null, lineCents: null, available: false };
		}
		return {
			...line,
			name: robot!.name,
			unitCents: sold.priceCents,
			lineCents: sold.priceCents * line.quantity,
			available: true,
		};
	});
	return { lines: priced, totalCents: priced.reduce((sum, line) => sum + (line.lineCents ?? 0), 0) };
};

export type CartSummaryResult =
	| { status: 200; body: CartSummary }
	| { status: 400; body: { error: 'invalid_cart' } }
	| { status: 429; body: { error: 'rate_limited' } };

/**
 * `POST /cart/summary`: rate limit by source IP first (before the body is parsed or D1 is
 * touched, the order of webhook-hardening.ts), then validate, then price from D1.
 */
export async function summarizeCart(
	env: SummaryEnv,
	params: { sourceIp: string | null; rawBody: string }
): Promise<CartSummaryResult> {
	const { success } = await env.CART_RATE_LIMITER.limit({ key: params.sourceIp ?? 'unknown' });
	if (!success) return { status: 429, body: { error: 'rate_limited' } };

	if (params.rawBody.length > MAX_BODY_CHARS) return { status: 400, body: { error: 'invalid_cart' } };
	let json: unknown;
	try {
		json = JSON.parse(params.rawBody);
	} catch {
		return { status: 400, body: { error: 'invalid_cart' } };
	}
	const parsed = parseCartLines(json);
	if (!parsed.ok) return { status: 400, body: { error: 'invalid_cart' } };

	return { status: 200, body: priceCart(parsed.lines, await listPublishedWithOffers(env)) };
}
