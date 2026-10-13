/**
 * Server-side pricing of a cart checkout (storefront-v2 ticket 10, ADR-0008, ADR-0006 "Server-side
 * price"). The client sends only `{robotId, offer, quantity}` per line; every price is read from
 * the D1 catalog here and nothing else the client sends is read. One unknown or unpublished line
 * rejects the whole checkout, never a partial one.
 */

import { listRobotNames, lookupOffer, type OfferName } from '../catalog/robots';
import { expandLines, type ExpandedCheckout, type PricedLine } from './checkout-lines';

type PriceEnv = Pick<Cloudflare.Env, 'DB'>;

/** An untrusted cart line, as parsed from a request body. */
export type CartLine = { robotId: unknown; offer: unknown; quantity: unknown };

/** Per-line cap (the tickets assume 5, ADR-0008 "Open"); the cart store enforces the same number client-side. */
export const MAX_LINE_QUANTITY = 5;
/** Bounds the D1 reads one request can cause. */
export const MAX_LINES = 20;

export type PriceCheckoutResult =
	| ({ ok: true } & ExpandedCheckout)
	| { ok: false; reason: 'empty' | 'too_many_lines' | 'invalid_quantity' | 'unknown_robot' | 'unknown_offer'; line?: number };

export async function priceCheckout(env: PriceEnv, lines: readonly CartLine[]): Promise<PriceCheckoutResult> {
	if (lines.length === 0) return { ok: false, reason: 'empty' };
	if (lines.length > MAX_LINES) return { ok: false, reason: 'too_many_lines' };

	const names = await listRobotNames(env);
	const priced: PricedLine[] = [];
	for (const [index, line] of lines.entries()) {
		const { robotId, offer, quantity } = line;
		if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
			return { ok: false, reason: 'invalid_quantity', line: index };
		}
		if (typeof robotId !== 'string' || typeof offer !== 'string') return { ok: false, reason: 'unknown_robot', line: index };
		const found = await lookupOffer(env, robotId, offer);
		if (found.kind !== 'found') return { ok: false, reason: found.kind, line: index };
		// `found` proves `offer` is one of the Robô's own OfferName keys.
		priced.push({ robotId, offer: offer as OfferName, name: names.get(robotId) ?? robotId, unitCents: found.amountCents, quantity });
	}
	return { ok: true, ...expandLines(priced) };
}
