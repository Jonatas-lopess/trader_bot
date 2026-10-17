# 18: Cart as a Popover from the header icon

**What to build:** a Cliente pressing the cart icon in the header sees the cart in a Popover anchored to the icon, instead of navigating to `/carrinho`. The Popover shows what the page shows today: the lines (name, Oferta label, quantity stepper, unit and line price, remove), the total, "Continuar comprando" and "Finalizar compra", with the empty, loading and error states. Pricing still comes from `POST /cart/summary`; nothing on screen is a price the server did not return.

**Blocked by:** None (can start immediately).

**Status:** done

- The cart icon in the header becomes the Popover trigger. Native Popover API preferred (light dismiss, Esc, focus handling); the icon keeps its badge with the unit count.
- Adding to the cart from the "Saiba mais" modal or a card keeps working. Whether it also opens the Popover is an owner call (default: it does not, the badge just updates).
- The Popover calls the summary when it opens, not at page load, so a page that never opens it makes no request.
- At phone width the Popover must not overflow the viewport; it may become a full-width sheet.
- "Finalizar compra" goes to the same checkout form as today.
- What happens to `/carrinho` is an owner call. Default: keep it as the no-JavaScript fallback and the link target of the icon when scripts are off, so the cart is never unreachable. If it is removed instead, the links to it (header, checkout, confirmation) and its tests go with it.
- Copy stays in `src/content/cart.ts`; reuse the cart page's rendering instead of duplicating it (extract the shared part from `src/shared/cart-page.ts`).

TDD seam: the cart rendering extracted from the page is shared by both surfaces; the store and the endpoint are unchanged.

- [x] Pressing the header icon opens the cart in a Popover anchored to it; Esc and an outside click close it and focus returns to the icon
- [x] Lines, stepper, remove, total, empty, loading and error states work in the Popover as they do on `/carrinho`
- [x] Changing a quantity re-prices through the server; the request carries no price
- [x] No summary request is made until the Popover is opened
- [x] The badge keeps counting units, including after adding from the modal
- [x] With JavaScript off the icon still reaches a usable cart
- [x] Phone width (390) does not overflow or scroll horizontally; desktop (1280) checked
- [x] Typecheck and the full test suite pass

## Comments

- Why: the owner wants the cart reachable from any page without leaving it, especially from `/catalog` while browsing.

Decisions (implementation: `src/shared/cart-view.ts`, `src/shared/cart-view-model.ts`, `src/shared/cart-popover.ts`, `src/components/cart-view.astro`, `src/components/cart-popover.astro`, `src/components/site-header.astro`, `src/pages/carrinho.astro`).

- **Shared rendering.** The page's markup became `cart-view.astro` and its script `cart-view.ts` (`mountCartView(root)` returns `activate` / `deactivate`); `/carrinho` and the Popover both mount it. What is shown (text, disabled states, checkout link) is decided by pure functions in `cart-view-model.ts`, which is the unit-tested seam (the test pool has no DOM). Lines lay out by container width (`@md:`), so they are a row on the page and a column in the Popover.
- **Lazy summary.** A view does nothing until `activate()`: the page activates at load, the Popover each time it opens (loading state first), and `deactivate()` unsubscribes from the store and drops the request in flight. A page that never opens it makes no `/cart/summary` request (checked in a browser: 0 requests after load and after adding two units).
- **Owner calls, defaults taken.** Adding from a card or the modal does not open the Popover, the badge just updates. `/carrinho` stays as the no-JavaScript fallback and the icon's `href`; with scripts on, a plain click on the icon opens the Popover, a modified click (new tab) still follows the link. On `/carrinho` itself the icon stays a plain link, since the page already is the cart.
- **Popover.** Native Popover API (`popover` auto: Esc and outside click close it). `<a>` cannot be a `popovertarget` invoker, so `cart-popover.ts` calls `showPopover()` and positions the panel from the icon's rect (two custom properties); at phone width it is a full-width sheet under the header. The panel starts `hidden` and is revealed only when `showPopover` exists, so a browser without the API shows no stray panel and keeps the link. Focus moves into the panel on open and back to the icon on close. A press on the icon while open closes it (the press light-dismisses before the click, so the click reads the state from the press).
- **Notes.** The payment-methods and withdrawal notes stay on the page only (`notes` prop); the Popover shows what the ticket lists. Checkout still shows the withdrawal note. "Continuar comprando" and the empty state's "Ver o catálogo" close the Popover, and on `/catalog` do nothing else.
- **Seen in a browser.** The built site, headless Chromium, at 1280 and 390 px: open, re-price on a quantity change (request body is only `robot`/`offer`/`quantity`), Esc and outside click close with focus back on the icon, icon toggles it, empty state, no horizontal overflow at 390. With JavaScript off the icon reaches `/carrinho`, which then shows its existing "Ative o JavaScript" message: the cart itself needs the browser's sessionStorage, as in 09.
