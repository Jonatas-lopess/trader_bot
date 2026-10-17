/**
 * The cart's shared vocabulary: the caps, the Oferta list and the shape of a line. Pure (no D1, no
 * DOM), so the browser cart store (`cart-store.ts`), the cart endpoint (`modules/catalog/price-cart.ts`),
 * checkout pricing (`modules/billing/price-checkout.ts`) and the admin form all import one source
 * of truth, and what the browser keeps is always something the server accepts.
 *
 * Naming: the cart's wire format (browser store, `POST /cart/summary`, the checkout page's config and
 * `POST /checkout/pay`) calls the Robô's slug `robot`; checkout, purchases and the database call the
 * same value `robotId` (`purchases.robot_id`). `toCartLine` and `fromCartLine` are the only places
 * one naming becomes the other.
 */

/** The Ofertas a cart line can hold: Compra and Anual (Mensal is on standby, ADR-0008). */
export type CartOffer = 'one_time' | 'annual';

/** Compra first, then Anual: the order the form and the catalog list them. */
export const CART_OFFERS: readonly CartOffer[] = ['one_time', 'annual'];

export const isCartOffer = (value: unknown): value is CartOffer => CART_OFFERS.includes(value as CartOffer);

/** A cart line: the Robô's slug, the Oferta and the units. Never a price or a name. */
export type CartLine = { robot: string; offer: CartOffer; quantity: number };

/** A checkout line (`robotId`) in the cart's wire naming (`robot`). */
export const toCartLine = ({ robotId, offer, quantity }: { robotId: string; offer: CartOffer; quantity: number }): CartLine => ({
	robot: robotId,
	offer,
	quantity,
});

/** An untrusted wire line in checkout's naming. Only these three keys are read: nothing else of the line goes on. */
export const fromCartLine = (line: Record<string, unknown>): { robotId: unknown; offer: unknown; quantity: unknown } => ({
	robotId: line.robot,
	offer: line.offer,
	quantity: line.quantity,
});

/** Per-line cap (the tickets assume 5, ADR-0008 "Open"). */
export const MAX_LINE_QUANTITY = 5;
/** Bounds the D1 reads one request can cause. */
export const MAX_LINES = 20;

const MAX_SLUG_LENGTH = 64;
/** Kebab-case: lowercase letters and digits joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isCartSlug = (value: unknown): value is string =>
	typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);

/**
 * The checkout URL of a cart (storefront-v2 11): one `line=<robot>:<offer>:<quantity>` param per
 * line, read back by `readCheckoutQuery` (`modules/billing/checkout.ts`). Never a price.
 */
export const cartCheckoutHref = (lines: readonly CartLine[]): string =>
	`/checkout?${lines.map((line) => `line=${encodeURIComponent(`${line.robot}:${line.offer}:${line.quantity}`)}`).join('&')}`;
