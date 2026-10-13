/**
 * Server-side pricing of a cart checkout (storefront-v2 ticket 10, ADR-0008, ADR-0006 "Server-side
 * price"). The client sends only `{robotId, offer, quantity}` per line; every price is read from
 * the D1 catalog here and nothing else the client sends is read. One unknown or unpublished line
 * rejects the whole checkout, never a partial one.
 */

import { MAX_LINE_QUANTITY, MAX_LINES } from '../../shared/cart-limits';
import { listRobotNames, lookupOffer, type OfferName } from '../catalog/robots';
import { expandLines, type ExpandedCheckout, type PricedCheckoutLine } from './checkout-lines';

type PriceEnv = Pick<Cloudflare.Env, 'DB'>;

/** An untrusted cart line, as parsed from a request body. */
export type RawCheckoutLine = { robotId: unknown; offer: unknown; quantity: unknown };

export type PriceCheckoutResult =
	| ({ ok: true } & ExpandedCheckout)
	| {
			ok: false;
			reason: 'empty' | 'too_many_lines' | 'invalid_quantity' | 'quantity_over_cap' | 'unknown_robot' | 'unknown_offer';
			line?: number;
	  };

/**
 * Lines naming the same `{robot, offer}` are merged (quantities summed) before the cap applies, so
 * repeating a line cannot get past `MAX_LINE_QUANTITY`. `line` on an error is the index of the
 * first line of the merged group, except `quantity_over_cap` where it is the line that tipped it.
 */
export async function priceCheckout(env: PriceEnv, lines: readonly RawCheckoutLine[]): Promise<PriceCheckoutResult> {
	if (lines.length === 0) return { ok: false, reason: 'empty' };
	if (lines.length > MAX_LINES) return { ok: false, reason: 'too_many_lines' };

	const merged = new Map<string, { robotId: string; offer: string; quantity: number; line: number }>();
	for (const [index, { robotId, offer, quantity }] of lines.entries()) {
		if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
			return { ok: false, reason: 'invalid_quantity', line: index };
		}
		if (typeof robotId !== 'string' || typeof offer !== 'string') return { ok: false, reason: 'unknown_robot', line: index };
		const key = JSON.stringify([robotId, offer]);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, { robotId, offer, quantity, line: index });
		} else if (existing.quantity + quantity > MAX_LINE_QUANTITY) {
			return { ok: false, reason: 'quantity_over_cap', line: index };
		} else {
			existing.quantity += quantity;
		}
	}

	const names = await listRobotNames(env);
	const priced: PricedCheckoutLine[] = [];
	for (const { robotId, offer, quantity, line } of merged.values()) {
		const found = await lookupOffer(env, robotId, offer);
		if (found.kind !== 'found') return { ok: false, reason: found.kind, line };
		// `found` proves `offer` is one of the Robô's own OfferName keys.
		priced.push({ robotId, offer: offer as OfferName, name: names.get(robotId) ?? robotId, unitCents: found.amountCents, quantity });
	}
	return { ok: true, ...expandLines(priced) };
}
