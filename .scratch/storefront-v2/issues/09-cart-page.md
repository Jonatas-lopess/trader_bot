# 09: Cart page `/carrinho` and `POST /cart/summary`

**What to build:** `src/pages/carrinho.astro` plus `src/pages/cart/summary.ts` and a pure `modules/catalog/price-cart.ts`.

- `POST /cart/summary` takes `{lines: [{robot, offer, quantity}]}`, validates shape and limits (max lines, quantity 1..5, only `one_time`/`annual`; anything else is a 400), prices every line from D1 and returns `{lines: [{robot, offer, quantity, name, unitCents, lineCents, available}], totalCents}`. Draft, archived, unknown or no-longer-offered lines come back `available: false` with no price; the client offers "remover". No auth needed. Rate-limited like other public endpoints (reuse the Rate Limiting binding approach of `webhook-hardening.ts`).
- The page is static HTML plus one script: read the store, call the summary, render lines (name, Oferta label, quantity stepper, unit and line price, remove), the total, "Continuar comprando" and "Finalizar compra". Empty state, loading state and error state with copy in `content/cart.ts`.
- Prices on screen are display only; the real price is re-read when paying (11).
- "Finalizar compra" goes to the checkout form for N lines (11). Until 11 lands it may be disabled with a note; record which.
- Show the withdrawal note and which payment methods apply (card, Pix, Boleto; Anual steered to Pix per PLANNING §6) from existing content.

**Blocked by:** 03, 08.

**Status:** done

TDD seam: `price-cart` (pure) and the endpoint (D1 real): totals, unavailable lines, tampered input rejected.

- [x] Cart shows server prices; changing the store's quantity updates totals through the server
- [x] Unavailable lines are flagged and excluded from the total
- [x] Bad payloads get 400; no price in the request is ever read
- [x] Looks right at 390 and 1280, empty and error states included
- [x] Typecheck and the full test suite pass

## Comments

- **"Finalizar compra" is disabled** with a visible note (`checkoutPendingNote` in `content/cart.ts`) until ticket 11 (checkout for N lines) lands. Ticket 11 must swap the disabled button in `src/pages/carrinho.astro` for the link to its checkout form and drop the note.
- **Endpoint:** `POST /cart/summary` (`src/pages/cart/summary.ts`) is a thin wrapper; all logic is `summarizeCart` in `modules/catalog/price-cart.ts` (rate limit by `CF-Connecting-IP` first, then parse, then `priceCart` over `listPublishedWithOffers`). New Rate Limiting binding `CART_RATE_LIMITER` (namespace_id 4, 20 per 10 s) in `wrangler.jsonc`: ticket 14's Encomenda limiter must not reuse namespace 4. Caps come from `modules/billing/price-checkout.ts` (`MAX_LINE_QUANTITY`, `MAX_LINES`) so cart and checkout agree. A repeated Robô + Oferta line is a 400 (the client merges repeats). Unavailable lines return `name` only for a published Robô (public anyway), `null` for draft, archived and unknown, so a draft's name never leaks.
- **Tests:** `price-cart.test.ts` runs the endpoint logic against real D1 (totals, unavailable lines, price changes and unpublish between calls, tampered input, rate limit via an injected limiter). No route-level HTTP test (the repo has none); the route was also exercised with `curl` against `astro preview`. Note Astro's own CSRF check answers 403 to a POST without a content-type, before the endpoint runs.
- **Verified in headless Chromium** (`astro build` + `astro preview`, local D1 seed) at 1280 and 390: empty, ready (with a coming-soon and an unknown line flagged and excluded from the total), error (forced 500) and retry states; `+` re-prices through the server (one request after the click burst), focus stays on the pressed control, the request body carries no price, the storage line updates, removing lines reaches the empty state, no horizontal scroll at 390. A Robô named `<img src=x onerror=alert(1)>` renders as text. Not verified: a screen reader, iOS Safari.
- The header badge counts units in the store, including a line that turns out unavailable, until the Cliente removes it.
- Payment note (`paymentMethodsNote`) is new placeholder copy wrapped in `launchBlocking` (PLANNING §6); the withdrawal note reuses `buyWithdrawalNote`.
