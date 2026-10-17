/**
 * What the cart shows, as plain data (storefront-v2 09 and 18). `src/shared/cart-view.ts` writes
 * these values into the DOM for both surfaces (the `/carrinho` page and the header Popover), so
 * the text, the disabled states and the checkout link are decided once, here, and are testable
 * without a DOM. Every price comes from the `POST /cart/summary` response; nothing here computes one.
 */

import {
	decreaseLabel,
	increaseLabel,
	removeLabelFor,
	unavailableLabel,
	unavailableNote,
	unitPriceSuffix,
} from '../content/cart';
import { formatBrl, offerLabels } from '../content/catalog-page';
import type { CartSummary, PricedCartLine } from '../modules/catalog/price-cart';
import { MAX_LINE_QUANTITY, cartCheckoutHref, type CartLine } from './cart-limits';

export const isCartSummary = (value: unknown): value is CartSummary =>
	typeof value === 'object' &&
	value !== null &&
	Array.isArray((value as CartSummary).lines) &&
	typeof (value as CartSummary).totalCents === 'number';

export type LineView = {
	label: string;
	offer: string;
	quantity: string;
	decreaseAria: string;
	increaseAria: string;
	removeAria: string;
	decreaseDisabled: boolean;
	increaseDisabled: boolean;
	/** The line and unit prices; null for an unavailable line (no price, no stepper, only "Remover"). */
	price: { line: string; unit: string } | null;
	unavailable: string | null;
};

export const lineView = (line: PricedCartLine): LineView => {
	// The slug stands in for the name of a Robô the catalog does not publish.
	const label = line.name ?? line.robot;
	const priced = line.available && line.lineCents !== null && line.unitCents !== null;
	return {
		label,
		offer: offerLabels[line.offer],
		quantity: String(line.quantity),
		decreaseAria: decreaseLabel(label),
		increaseAria: increaseLabel(label),
		removeAria: removeLabelFor(label),
		decreaseDisabled: line.quantity <= 1,
		increaseDisabled: line.quantity >= MAX_LINE_QUANTITY,
		price: priced
			? {
					line: formatBrl(line.lineCents!),
					unit: line.quantity > 1 ? `${formatBrl(line.unitCents!)} ${unitPriceSuffix}` : '',
				}
			: null,
		unavailable: priced ? null : unavailableLabel,
	};
};

export type SummaryView = {
	total: string;
	/** Why checkout is disabled; null when it is not. */
	note: string | null;
	/** The checkout link of what the store holds right now (the server prices it again); null while disabled. */
	checkoutHref: string | null;
};

export const summaryView = (summary: CartSummary, storeLines: readonly CartLine[]): SummaryView => {
	const hasUnavailable = summary.lines.some((l) => !l.available);
	return {
		total: formatBrl(summary.totalCents),
		note: hasUnavailable ? unavailableNote : null,
		checkoutHref: hasUnavailable ? null : cartCheckoutHref(storeLines),
	};
};
