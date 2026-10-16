# 11: Checkout and pay for a cart

**What to build:** Make the own checkout (appmax-checkout 04/05) accept N lines. `/checkout` gains a cart entry: the cart page posts the lines (form POST or `sessionStorage` read by the checkout page script) and the page shows the order summary with every line from the server. The single-item `/checkout?robot=&offer=` URL keeps working (a one-line cart).

- `pay` (appmax-checkout 05): price with `priceCheckout` (10), insert all `purchases` rows `pending` before calling Appmax (same "insert first" rule), `createOrder` with one `products[]` entry per line, store the Appmax order id on **every** row before the payment call, then the payment call once for the order. Pix and Boleto instructions are stored per checkout (put them on the first row or on all; record the choice, the status endpoint reads by `checkout_id`).
- Payment methods: the intersection of `paymentMethodsFor` for every line (Compra and Anual are both card/Boleto/Pix, so all three).
- Client-sent prices ignored; a line with any offer other than `one_time`/`annual` is rejected 400.
- Idempotency: a retried POST with the same `reference` must not double-insert rows or double-create the order.
- Clear the cart store after a successful pay response (script on the confirmation navigation), not before.
- One buyer: name, CPF/CNPJ, e-mail apply to every row (`buyer_*` copied per row, used by NFS-e).

**Blocked by:** 09, 10, appmax-checkout 04 and 05.

**Status:** done

TDD seam: `pay` with mocked Appmax `fetch`: row counts, one order, ids on all rows, retry safety, `monthly` rejected, price tamper.

- [x] A 3-Licença cart creates 3 `pending` rows, one Appmax order with the right products and total
- [x] Retry of the same POST creates nothing new
- [x] Single-item URL unchanged
- [ ] Cart emptied only after a successful pay (in code, not exercised in a browser; see Comments)
- [ ] Typecheck and the full test suite pass (typecheck and the touched test files pass; the full suite runs once at the end of the batch, recorded in ticket 15)

## Comments

- **Cart entry is a GET URL**, `/checkout?line=<robot>:<offer>:<quantity>&line=...` (one param per line, never a price), built by the cart page from the store (`cartCheckoutHref` in `shared/cart-limits.ts`) and read by `readCheckoutQuery`. Chosen over a form POST or a `sessionStorage` read: the page stays server-rendered with server prices and a reload re-renders the same order. `/checkout?robot=&offer=` is still accepted and is a one-line cart of one unit.
- `resolveCheckout` prices every line with `priceCheckout`; the form result now carries `lines` (name, Oferta, quantity, unit price from D1), `amountCents` (the total), `methods` (intersection over the lines) and `fromCart`. Any bad line is a 400 for the whole cart; a Mensal line is `unavailable`. The Stripe test driver takes one item, so a cart of more than one Licença is `unavailable` with reason `cart_not_supported` (copy `cartUnavailable`, back to `/carrinho`).
- `pay` accepts `lines: [{robot, offer, quantity}]` (or the old `robot` + `offer`). Codes: a Mensal line `offer_not_supported`; unknown, draft, archived Robô or an offer it does not sell `unknown_offer`; bad quantity, over the cap (after merging repeats), empty or malformed lines `invalid_request`.
- **Idempotency:** all rows go in one `DB.batch` (one transaction). The first row's `id` is the reference and its INSERT has no `ON CONFLICT`, so a repeated POST fails on the primary key and the whole batch rolls back; then the existing row is found and the attempt answers its confirmation URL. A retry with different lines under the same reference also creates nothing (tested).
- `appmax_order_id` is written on every row (`WHERE checkout_id = ?`) before the payment call; fewer rows updated than inserted means no payment (502). **Pix/Boleto instructions are stored on every row of the checkout**, so whichever row the status read meets first answers for the group.
- `createOrder` now takes `products[]` (from `expandLines`, one entry per line with its quantity); `ExpandedCheckout` also returns the priced `lines`.
- The cart page's "Finalizar compra" is now a link (set by `cart-page.ts` on each render and again on click, so a quantity change still being re-priced is not lost), disabled with `aria-disabled` and described by the unavailable note while any line is unavailable. `checkoutPendingNote` is gone.
- The checkout script sends `lines` and, only for a checkout that came from the cart, clears the cart store after a `200 {ok, redirectUrl}` and before navigating. A 402/429/502 or network error keeps the cart. Not exercised in a browser in this run, so that box stays open.
- Order summary on `/checkout` lists each line (name, `Oferta · N licenças`, line price) and the total; Anual in the order puts Pix first.

