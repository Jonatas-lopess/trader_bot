# 05: Pay endpoint: price, customer, order, payment, provisional row

**What to build:** `POST /checkout/pay` (`src/pages/checkout/pay.ts`, thin adapter) around a use case `modules/billing/pay.ts`. JSON body: `{reference, robot, offer, method, buyer{name,email,phone,document}, token?}`. Card data is never in the body, only the Appmax token.

Steps, in this order (the order is a decision, see spec "Decisions carried by the tickets"):

1. Validate with `buyer-input.ts` (03); `method` must be in `paymentMethodsFor(offer)`; `token` required iff `method === 'card'`. Unknown robot/offer is 400; price comes from `lookupOffer`, nothing price-like in the body is read (ADR-0006). Mensal is refused (09). Duplicate active Licença for a logged-in Cliente is 409 as in `checkout.ts`.
2. `INSERT INTO purchases` with `id = reference`, `status 'pending'`, `amount_cents`, `provider 'appmax'`, `payment_method`, `buyer_name`, `buyer_document` (normalized). A primary-key conflict means a repeated POST: return the existing attempt's outcome instead of creating anything.
3. `createCustomer` (IP: see below), `createOrder`; then `UPDATE purchases SET appmax_order_id` **before** the payment call. If that update fails, do not call the payment endpoint.
4. `payCreditCard` (`holder_document_number` = the buyer's document, `holder_name` from the card holder field forwarded by the page since Appmax JS reads it; assumes holder = buyer, to verify in 08), `payPix` or `payBoleto` with the buyer's `document_number`.
5. Persist the Pix or Boleto data on the row: migration `0012_payment_instructions.sql` adds `purchases.payment_instructions` (JSON text: Pix `{qrCode, emvCode, expiresAt}`, Boleto `{pdfUrl, digitableLine, dueDate}`). Card stores nothing.
6. Respond `{ok:true, redirectUrl: '/checkout/confirmacao?ref=<reference>'}` for every method.

Errors as discriminated unions mapped to HTTP: validation 400 with `fieldErrors`; card declined 402 `{code:'card_declined'}` with a **fresh** `reference` (a refused order cannot be reused); Appmax unavailable or auth failed 502; the pending row of a failed attempt stays inert (status page treats a stale `pending` as retry-from-catalog, existing behavior).

- **Client IP.** `createCustomer` needs `ip`. Appmax JS collects the client IP on the page; we can also read `CF-Connecting-IP`. Default to `CF-Connecting-IP` server-side (it cannot be forged by the browser body); sandbox falls back to `127.0.0.1` when the header is absent (local dev), production without a usable IP fails closed with a Sentry report. 08 confirms what the sandbox accepts and whether Appmax cross-checks it against the JS-collected value; revise then.
- **Abuse.** This route lets anyone create Appmax customers/orders and test cards. Add a Cloudflare Rate Limiting binding (same pattern as `LOGIN_RATE_LIMITER`, keyed by IP) on the route. Whether to add Turnstile is an owner decision, noted not built.
- Never log the body, token, document, phone or e-mail; Sentry `extra` carries `purchase_id`/reason codes only.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-agent

TDD seam: `pay.ts` against real D1 with `fetch` to Appmax mocked: assert rows after each failure point (customer fails, order fails, payment fails) and the call order.

- [ ] Compra and Anual by card, Pix and Boleto write one `pending` row with the server price, method and buyer fields, and return the confirmation redirect
- [ ] `appmax_order_id` is written before the payment call; if the update fails no payment is attempted
- [ ] A repeated POST with the same `reference` creates no second customer, order or charge
- [ ] Card declined: 402 with a fresh `reference`, nothing marks the row active, no card data stored
- [ ] Price tampering, unknown robot/offer, method not allowed for the Oferta, missing token and Mensal are rejected
- [ ] Pix and Boleto instructions persist in `payment_instructions` (migration 0012, covered by `schema.test.ts`)
- [ ] IP choice implemented as above, covered for sandbox fallback and production fail-closed
- [ ] Rate-limit binding added to `wrangler.jsonc` and types regenerated; over-limit returns 429
- [ ] No personal or card data in logs or Sentry (asserted in a test on the captured calls)
- [ ] Buyer name and document land in `buyer_name`/`buyer_document` and survive the webhook's `COALESCE`
- [ ] Typecheck and the full test suite pass
