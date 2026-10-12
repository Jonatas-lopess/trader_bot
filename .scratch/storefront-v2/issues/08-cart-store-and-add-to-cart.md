# 08: Cart store, header icon and "Adicionar ao carrinho"

**What to build:** Add `zustand` (pnpm). `src/shared/cart-store.ts`: `createStore` from `zustand/vanilla` with `persist` + `createJSONStorage(() => sessionStorage)`, the only file that imports zustand (PLANNING §3).

- State: `lines: {robot: string, offer: 'one_time' | 'annual', quantity: number}[]`. **Never a price or a name.** Actions: `add(robot, offer)` (merges into an existing line, quantity cap 5), `setQuantity`, `remove`, `clear`. Only Compra and Anual exist (the `offer` type has no `monthly`).
- Storage is injected so the store is testable without a DOM; a versioned persist key (`rt-cart-v1`) and a `migrate`/`onRehydrate` that drops malformed or unknown lines instead of crashing.
- SSR: the store is created and read only in browser `<script>`s; no server rendering of cart state, so the header count hydrates after load (no layout shift: reserve the badge space).
- Header: cart icon (`@lucide/astro` `ShoppingCart`) with a count badge, link to `/carrinho`; label in `content/header.ts`; works in the mobile menu. `aria-live` polite announcement on add, a short "adicionado" state on the button.
- Wire the button on the card (07) and in the modal (06): data attributes `data-add-to-cart data-robot data-offer`, one delegated listener in a single script. Which Oferta the button adds on the card: Compra if offered, else Anual; in the modal, the selected price row.
- Cross-tab: `sessionStorage` is per tab by design (owner asked for session cache); no storage-event sync.

**Blocked by:** 07.

**Status:** ready-for-agent

TDD seam: the store with an in-memory storage (add/merge/cap/remove/clear, malformed persisted data, unknown offer dropped).

- [ ] Add from card and from the modal; header count updates; survives reload in the same tab; empty in a new tab
- [ ] Corrupt `sessionStorage` content does not break the page
- [ ] No price is ever written to storage
- [ ] Keyboard and screen-reader usable
- [ ] Typecheck and the full test suite pass
