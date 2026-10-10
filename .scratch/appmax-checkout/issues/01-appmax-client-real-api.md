# 01: Appmax client against the documented API

**What to build:** Rewrite `src/modules/billing/appmax-client.ts` onto the endpoints docs.appmax.com.br documents (PLANNING.md §13, "Appmax API facts for the own checkout"), keeping it the one outbound-fetch seam to Appmax. Today every path lacks `/v1`, `getAccessToken` is called per request, `fetchAuthoritativeStatus` reads `data.status` where the docs put `data.order.status`, and `cancelSubscription` uses `POST` where the docs say `PATCH /v1/subscriptions/{id}/cancel`.

- Environment: `APPMAX_ENV` (`'sandbox'` default; only an explicit `'production'` switches). Sandbox hosts `auth.sandboxappmax.com.br` / `api.sandboxappmax.com.br`, production the same without `sandbox`. One small pure function picks the hosts; add the var to `.dev.vars.example` and `wrangler.jsonc`, regenerate `worker-configuration.d.ts`.
- `getAccessToken`: form-encoded client credentials, `expires_in` 3600. Decide cache or not and record the choice in the file header. Recommended: cache in module scope with a safety margin (refresh 5 minutes early), because the webhook has a 5 s budget and a token round trip per refetch is wasted; the cache must not outlive the credentials (key it on `client_id` + environment) and tests need a reset hook. KV is not used (PLANNING.md §3).
- New functions, each returning a discriminated union (`{ok:true,...} | {ok:false, reason}`, PLANNING.md §5), money in cents: `createCustomer` (`POST /v1/customers` → `data.customer.id`), `createOrder` (`POST /v1/orders`, one product per order: `sku` = `<robot>:<offer>`, quantity 1, `unit_value` = `amount_cents`, `shipping_value` and `discount_value` 0, product `type` digital; the enum is unverified → 08), `payCreditCard` (`/v1/payments/credit-card`, `payment_data.credit_card{token, holder_document_number, holder_name, installments: 1, soft_descriptor}`), `payPix`, `payBoleto`, `getOrder`.
- Distinguish failure reasons the callers need: auth failed, Appmax unavailable (network, 5xx), request rejected (4xx with Appmax's message, kept out of logs if it can carry personal data), and for card payment `not_authorized` (the docs' "Payment not authorized").
- Fix `fetchAuthoritativeStatus` to `GET /v1/orders/{id}` reading `data.order.status`, `data.customer{...}`, `data.order.amounts.sub_total` (confirm placement against the doc shape `data.order{id,status,total_paid,amounts{...}}`), and the payment method from `data.payment`. Subscription path `GET /v1/subscriptions/{id}` and `cancelSubscription` as `PATCH` get the `/v1` prefix; no behavior change otherwise (Mensal is 09).
- Do **not** delete `createHostedCheckoutSession` here (02 does, together with the seam change), so the suite stays green between tickets; mark it deprecated in the header.
- Rewrite the header comment: the "hosted-checkout" contract text is wrong now; state what is documented, what is still unverified (08), and keep the `amounts.sub_total` paragraph.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

TDD seam: mocked `fetch` per function, asserting URL, method, headers, body encoding and the mapped result. Existing `webhook.test.ts`, `e2e.test.ts`, `catalog-e2e.test.ts` mocks of the order response move to the documented shape in this ticket.

- [ ] `APPMAX_ENV` picks sandbox or production hosts; anything but `'production'` is sandbox; covered by a pure test
- [ ] Token: form body and `Authorization: Bearer` on every call; cache behavior (hit, expiry, failure not cached) tested, and the decision recorded in the header
- [ ] `createCustomer`, `createOrder`, `payCreditCard`, `payPix`, `payBoleto`, `getOrder` send the documented bodies and map `data.customer.id`, `data.order.id`, `data.order.status`, `data.pix{qr_code,emv_code,expires_at}`, `data.boleto{pdf_url,digitable_line,due_date}`
- [ ] Card `Payment not authorized` maps to a distinct `not_authorized` result; auth failure, 5xx/network and other 4xx are distinct reasons
- [ ] `fetchAuthoritativeStatus` reads the documented order shape and still returns `reportedAmountCents` from `amounts.sub_total`
- [ ] No request body or card token is ever logged or put into a Sentry message
- [ ] Header comment rewritten; unverified fields listed for 08
- [ ] Typecheck and the full test suite pass
