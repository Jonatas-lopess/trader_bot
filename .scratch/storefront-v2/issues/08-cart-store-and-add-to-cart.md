# 08: Cart store, header icon and "Adicionar ao carrinho"

**What to build:** Add `zustand` (pnpm). `src/shared/cart-store.ts`: `createStore` from `zustand/vanilla` with `persist` + `createJSONStorage(() => sessionStorage)`, the only file that imports zustand (PLANNING §3).

- State: `lines: {robot: string, offer: 'one_time' | 'annual', quantity: number}[]`. **Never a price or a name.** Actions: `add(robot, offer)` (merges into an existing line, quantity cap 5), `setQuantity`, `remove`, `clear`. Only Compra and Anual exist (the `offer` type has no `monthly`).
- Storage is injected so the store is testable without a DOM; a versioned persist key (`rt-cart-v1`) and a `migrate`/`onRehydrate` that drops malformed or unknown lines instead of crashing.
- SSR: the store is created and read only in browser `<script>`s; no server rendering of cart state, so the header count hydrates after load (no layout shift: reserve the badge space).
- Header: cart icon (`@lucide/astro` `ShoppingCart`) with a count badge, link to `/carrinho`; label in `content/header.ts`; works in the mobile menu. `aria-live` polite announcement on add, a short "adicionado" state on the button.
- Wire the button on the card (07) and in the modal (06): data attributes `data-add-to-cart data-robot data-offer`, one delegated listener in a single script. Which Oferta the button adds on the card: Compra if offered, else Anual; in the modal, the selected price row.
- Cross-tab: `sessionStorage` is per tab by design (owner asked for session cache); no storage-event sync.

**Blocked by:** 07.

**Status:** done

TDD seam: the store with an in-memory storage (add/merge/cap/remove/clear, malformed persisted data, unknown offer dropped).

- [x] Add from card and from the modal; header count updates; survives reload in the same tab; empty in a new tab
- [x] Corrupt `sessionStorage` content does not break the page
- [x] No price is ever written to storage
- [ ] Keyboard and screen-reader usable
- [x] Typecheck and the full test suite pass

## Comments

- **Verified in headless Chromium** (`astro build` + `astro preview`, 1280 and 390): add from a card and from the modal (selected row's Oferta), the header count and its `aria-label` update, the button shows "Adicionado" for 1.5 s, the polite live region receives "Adicionado ao carrinho.", the cart survives a reload and is empty in a new tab of the same context, and a corrupt `rt-cart-v1` leaves the page working with an empty cart. Storage holds only `{state:{lines:[{robot,offer,quantity}]},version:1}`. "Keyboard and screen-reader usable" is left unticked: buttons and the link are native, labelled elements, but no real screen reader was run.
- Layout: `src/shared/cart-store.ts` (only zustand importer; `MAX_QUANTITY` 5, `MAX_LINES` 20), `src/shared/cart-client.ts` (count, delegated click, feedback; started from `site-header.astro`), `src/components/cart-link.astro`, copy in `src/content/cart.ts` and `src/content/header.ts`.
- The cart icon sits in the mobile bar next to the menu button (not inside the collapsed panel), so it is reachable without opening the menu; it is also in the desktop nav.
- Add buttons are `hidden` until the script sets `data-cart-ready` on `<html>` (`in-data-cart-ready:inline-flex`), so cloned modal buttons need no extra wiring and there is no dead button without JavaScript.
- The store sanitizes on rehydrate (`merge` + `migrate`): extra fields such as a smuggled price are stripped, unknown offers (including `monthly`) dropped, quantities clamped, duplicates merged, and a throwing `sessionStorage` falls back to memory.
