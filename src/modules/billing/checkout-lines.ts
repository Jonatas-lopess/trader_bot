/**
 * The pure arithmetic of a multi-line checkout (ADR-0008): priced lines in, one `purchases` row
 * per Licença, the total and Appmax's `products[]` out. No D1, no validation: `price-checkout.ts`
 * resolves the prices and this only expands and sums. Kept in its own file so the cart page's
 * pricing (storefront-v2 09, `modules/catalog/price-cart.ts`) can reuse it.
 */

import type { OfferName } from '../catalog/robots';

/** A line whose unit price was already read from the catalog. `quantity` is a positive integer. */
export type PricedCheckoutLine = { robotId: string; offer: OfferName; name: string; unitCents: number; quantity: number };

/** What becomes one `purchases` row: one Licença. */
export type CheckoutRow = { robotId: string; offer: OfferName; amountCents: number };

/** One entry of Appmax's `products[]` (appmax-client.ts `createOrder`); `sku` is `<robot>:<offer>`. */
export type AppmaxProduct = { sku: string; name: string; quantity: number; unit_value: number; type: 'digital' };

/** `lines` are the priced lines as given (one per `products` entry, same order). */
export type ExpandedCheckout = { lines: PricedCheckoutLine[]; rows: CheckoutRow[]; totalCents: number; products: AppmaxProduct[] };

/**
 * A line of quantity N is N rows (one Licença each) and one product entry with `quantity` N, so
 * the sum of the rows' `amountCents` equals the sum of `quantity * unit_value` over `products`
 * (Appmax's `amounts.sub_total`, which the webhook compares against, ticket 12).
 */
export function expandLines(lines: readonly PricedCheckoutLine[]): ExpandedCheckout {
	const rows: CheckoutRow[] = [];
	const products: AppmaxProduct[] = [];
	for (const { robotId, offer, name, unitCents, quantity } of lines) {
		for (let unit = 0; unit < quantity; unit++) rows.push({ robotId, offer, amountCents: unitCents });
		products.push({ sku: `${robotId}:${offer}`, name, quantity, unit_value: unitCents, type: 'digital' });
	}
	return { lines: [...lines], rows, totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0), products };
}
