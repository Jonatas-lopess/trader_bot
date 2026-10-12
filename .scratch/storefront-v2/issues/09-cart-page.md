# 09: Cart page `/carrinho` and `POST /cart/summary`

**What to build:** `src/pages/carrinho.astro` plus `src/pages/cart/summary.ts` and a pure `modules/catalog/price-cart.ts`.

- `POST /cart/summary` takes `{lines: [{robot, offer, quantity}]}`, validates shape and limits (max lines, quantity 1..5, only `one_time`/`annual`; anything else is a 400), prices every line from D1 and returns `{lines: [{robot, offer, quantity, name, unitCents, lineCents, available}], totalCents}`. Draft, archived, unknown or no-longer-offered lines come back `available: false` with no price; the client offers "remover". No auth needed. Rate-limited like other public endpoints (reuse the Rate Limiting binding approach of `webhook-hardening.ts`).
- The page is static HTML plus one script: read the store, call the summary, render lines (name, Oferta label, quantity stepper, unit and line price, remove), the total, "Continuar comprando" and "Finalizar compra". Empty state, loading state and error state with copy in `content/cart.ts`.
- Prices on screen are display only; the real price is re-read when paying (11).
- "Finalizar compra" goes to the checkout form for N lines (11). Until 11 lands it may be disabled with a note; record which.
- Show the withdrawal note and which payment methods apply (card, Pix, Boleto; Anual steered to Pix per PLANNING §6) from existing content.

**Blocked by:** 03, 08.

**Status:** ready-for-agent

TDD seam: `price-cart` (pure) and the endpoint (D1 real): totals, unavailable lines, tampered input rejected.

- [ ] Cart shows server prices; changing the store's quantity updates totals through the server
- [ ] Unavailable lines are flagged and excluded from the total
- [ ] Bad payloads get 400; no price in the request is ever read
- [ ] Looks right at 390 and 1280, empty and error states included
- [ ] Typecheck and the full test suite pass
