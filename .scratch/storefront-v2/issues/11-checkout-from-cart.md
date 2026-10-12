# 11: Checkout and pay for a cart

**What to build:** Make the own checkout (appmax-checkout 04/05) accept N lines. `/checkout` gains a cart entry: the cart page posts the lines (form POST or `sessionStorage` read by the checkout page script) and the page shows the order summary with every line from the server. The single-item `/checkout?robot=&offer=` URL keeps working (a one-line cart).

- `pay` (appmax-checkout 05): price with `priceCheckout` (10), insert all `purchases` rows `pending` before calling Appmax (same "insert first" rule), `createOrder` with one `products[]` entry per line, store the Appmax order id on **every** row before the payment call, then the payment call once for the order. Pix and Boleto instructions are stored per checkout (put them on the first row or on all; record the choice, the status endpoint reads by `checkout_id`).
- Payment methods: the intersection of `paymentMethodsFor` for every line (Compra and Anual are both card/Boleto/Pix, so all three).
- Client-sent prices ignored; a line with any offer other than `one_time`/`annual` is rejected 400.
- Idempotency: a retried POST with the same `reference` must not double-insert rows or double-create the order.
- Clear the cart store after a successful pay response (script on the confirmation navigation), not before.
- One buyer: name, CPF/CNPJ, e-mail apply to every row (`buyer_*` copied per row, used by NFS-e).

**Blocked by:** 09, 10, appmax-checkout 04 and 05.

**Status:** ready-for-agent

TDD seam: `pay` with mocked Appmax `fetch`: row counts, one order, ids on all rows, retry safety, `monthly` rejected, price tamper.

- [ ] A 3-Licença cart creates 3 `pending` rows, one Appmax order with the right products and total
- [ ] Retry of the same POST creates nothing new
- [ ] Single-item URL unchanged
- [ ] Cart emptied only after a successful pay
- [ ] Typecheck and the full test suite pass
