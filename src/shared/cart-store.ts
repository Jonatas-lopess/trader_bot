/**
 * Cart store — .scratch/storefront-v2/issues/08-cart-store-and-add-to-cart.md, ADR-0008.
 *
 * The only file that imports zustand (PLANNING.md §3). A vanilla store persisted to
 * `sessionStorage` under a versioned key: the cart survives a reload in the same tab and is empty
 * in a new tab or browser session, which is what the owner asked for. Nothing about the cart is
 * stored server-side before payment.
 *
 * A line is `{ robot, offer, quantity }` and nothing else: never a price or a name. The price is
 * read from D1 by `POST /cart/summary` for display and again at checkout (ADR-0006), so a tampered
 * browser cannot change what is charged. Only Compra and Anual exist (Mensal is on standby).
 *
 * Browser-only: the instance (`getCartStore`) is created on first use from a `<script>`, never
 * during server rendering. Storage is injected into `createCartStore` so the tests need no DOM.
 */

import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { OfferName } from '../modules/catalog/robots';
import { MAX_CART_LINES, MAX_LINE_QUANTITY, isCartOffer, isCartSlug } from '../modules/catalog/price-cart';

/** The Ofertas a cart line can hold: the catalog's Compra and Anual, never `monthly`. */
export type CartOffer = OfferName;

export type CartLine = { robot: string; offer: CartOffer; quantity: number };

export type CartState = {
	lines: CartLine[];
	/** Adds one unit, merging into the line of the same Robô and Oferta (capped at MAX_QUANTITY). */
	add: (robot: string, offer: CartOffer) => void;
	/** Sets a line's units, clamped to MAX_QUANTITY; zero or less removes the line. */
	setQuantity: (robot: string, offer: CartOffer, quantity: number) => void;
	remove: (robot: string, offer: CartOffer) => void;
	clear: () => void;
};

export const CART_STORAGE_KEY = 'rt-cart-v1';
const CART_VERSION = 1;
// The caps and the shape checks are the cart endpoint's own (modules/catalog/price-cart.ts), so
// what the store keeps is always something `POST /cart/summary` accepts.
export const MAX_QUANTITY = MAX_LINE_QUANTITY;
export const MAX_LINES = MAX_CART_LINES;
export { isCartOffer };

const clampQuantity = (quantity: number): number => Math.min(MAX_QUANTITY, Math.floor(quantity));

/**
 * Whatever the storage held, as a clean list of lines: malformed or unknown-offer lines are
 * dropped, extra fields (a smuggled price) stripped, quantities clamped, duplicates merged. A
 * corrupt cart must never break the page, so this never throws.
 */
export const sanitizeLines = (raw: unknown): CartLine[] => {
	if (!Array.isArray(raw)) return [];
	const lines: CartLine[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) continue;
		const { robot, offer, quantity } = item as Record<string, unknown>;
		if (!isCartSlug(robot) || !isCartOffer(offer)) continue;
		if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) continue;
		const existing = lines.find((l) => l.robot === robot && l.offer === offer);
		if (existing) existing.quantity = clampQuantity(existing.quantity + quantity);
		else if (lines.length < MAX_LINES) lines.push({ robot, offer, quantity: clampQuantity(quantity) });
	}
	return lines;
};

/** The header badge number: units, not lines. */
export const cartCount = (state: Pick<CartState, 'lines'>): number =>
	state.lines.reduce((sum, line) => sum + line.quantity, 0);

/** A storage that never throws: sessionStorage can be blocked or full, and the cart then lives in memory. */
const guarded = (storage: StateStorage): StateStorage => ({
	getItem: (name) => {
		try {
			return storage.getItem(name);
		} catch {
			return null;
		}
	},
	setItem: (name, value) => {
		try {
			storage.setItem(name, value);
		} catch {
			// not persisted; the in-memory cart still works
		}
	},
	removeItem: (name) => {
		try {
			storage.removeItem(name);
		} catch {
			// nothing to remove
		}
	},
});

const sameLine = (robot: string, offer: CartOffer) => (line: CartLine) => line.robot === robot && line.offer === offer;

export const createCartStore = (storage: StateStorage): StoreApi<CartState> =>
	createStore<CartState>()(
		persist(
			(set) => ({
				lines: [],
				add: (robot, offer) =>
					set((state) => {
						const existing = state.lines.find(sameLine(robot, offer));
						if (existing) {
							return {
								lines: state.lines.map((line) =>
									line === existing ? { ...line, quantity: clampQuantity(line.quantity + 1) } : line
								),
							};
						}
						if (state.lines.length >= MAX_LINES) return state;
						return { lines: [...state.lines, { robot, offer, quantity: 1 }] };
					}),
				setQuantity: (robot, offer, quantity) =>
					set((state) => {
						if (!Number.isFinite(quantity) || quantity < 1) {
							return { lines: state.lines.filter((line) => !sameLine(robot, offer)(line)) };
						}
						return {
							lines: state.lines.map((line) =>
								sameLine(robot, offer)(line) ? { ...line, quantity: clampQuantity(quantity) } : line
							),
						};
					}),
				remove: (robot, offer) =>
					set((state) => ({ lines: state.lines.filter((line) => !sameLine(robot, offer)(line)) })),
				clear: () => set({ lines: [] }),
			}),
			{
				name: CART_STORAGE_KEY,
				version: CART_VERSION,
				storage: createJSONStorage(() => guarded(storage)),
				// Only the lines are persisted (never an action, never anything else).
				partialize: (state) => ({ lines: state.lines }),
				// An older or odd version is read as lines, not discarded wholesale.
				migrate: (persisted) => ({ lines: sanitizeLines((persisted as { lines?: unknown } | null)?.lines) }),
				// Rehydration goes through the same sanitizer, so shape-corrupt storage cannot reach state.
				merge: (persisted, current) => ({
					...current,
					lines: sanitizeLines((persisted as { lines?: unknown } | null)?.lines),
				}),
			}
		)
	);

let browserStore: StoreApi<CartState> | null = null;

/** The page's cart, over `sessionStorage`. Call from browser scripts only. */
export const getCartStore = (): StoreApi<CartState> => {
	browserStore ??= createCartStore(sessionStorage);
	return browserStore;
};
