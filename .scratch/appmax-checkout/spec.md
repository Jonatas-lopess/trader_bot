# appmax-checkout

Status: ready-for-agent

Replaces the planned Appmax hosted checkout with our own checkout form on Appmax's API. Decided
by the owner on 2026-10-09 and recorded in [ADR-0007](../../docs/adr/0007-own-checkout-on-appmax.md);
that ADR is the source of truth, this spec turns it into work. Scope: Compra and Anual (card, Pix,
Boleto). Mensal recurrence is a research ticket (09). The Stripe test driver stays (ADR-0005) and
is removed by a later ticket (10).

Governing docs: ADR-0007, ADR-0003 (Appmax), ADR-0005 (Stripe driver and the `IPaymentProvider`
seam), ADR-0006 (price integrity, purchase status ranking); PLANNING.md §6, §7, §13; CONTEXT.md
(Robô, Oferta, Compra, Anual, Mensal, Assinatura, Cliente, Boleto, Pix);
`docs/agents/content-files.md`.

Per the project memory, the Appmax account, domain and Resend gate going live, not the build:
tickets 01 to 07 proceed against mocked `fetch`. Only 08 needs real sandbox credentials, and
PLANNING.md §12 says Appmax account creation itself is currently blocked.

## Problem Statement

`appmax-client.ts` was written for a hosted checkout that does not exist: `POST /payment-links` with
`return_url`, `external_id`, `payment_methods`, `recurring`, none of it documented, and no `/v1`
prefix on any path. Appmax's only hosted offer is a shareable payment link (`POST /v1/payment-link`)
that cannot carry our `reference`, cannot send the Cliente back to our confirmation page and has no
recurrence (ADR-0007). So as written the Appmax path of `/checkout` cannot work, and the current
tests only pass because they mock the guessed contract.

We also have no place to collect what Appmax needs to take a payment (name, e-mail, phone,
CPF/CNPJ, client IP) and no UI for Pix (QR, copy-paste code, expiry) or Boleto (PDF, digitable
line, due date), which today's confirmation page cannot show.

## Solution

`/checkout?robot=&offer=` renders our own page when the active provider is Appmax: order summary,
buyer fields, payment method choice limited by `paymentMethodsFor(offer)`, and card fields that
Appmax JS tokenizes in the browser. A server endpoint prices from the catalog, creates the Appmax
customer, order and payment, writes the provisional `purchases` row and sends the Cliente to the
confirmation page, which shows the method-specific instructions and polls the existing status
endpoint. The webhook keeps its authoritative-refetch posture and is mapped to the real events.

## Flow (text)

```
/catalog "Comprar"  -->  GET /checkout?robot=&offer=
   provider.checkout === 'redirect' (Stripe)  -->  302 to Stripe          (unchanged)
   provider.checkout === 'own-form' (Appmax)  -->  render our page, mint `reference`
        browser: Appmax JS init({externalId, onTokenize, onError}) on load (collects client IP)
        Cliente fills buyer data, picks card | Pix | Boleto
          card : Appmax JS tokenizes card fields in the browser --> token
          pix/boleto: no token
        browser --> POST /checkout/pay {reference, robot, offer, method, buyer, token?}
            server: validate; price from catalog (client price ignored); duplicate-license check
                    INSERT purchases (id=reference, pending, amount_cents, provider appmax, method, buyer_*)
                    POST /v1/customers -> POST /v1/orders -> UPDATE purchases.appmax_order_id
                    POST /v1/payments/{credit-card|pix|boleto}
                    persist Pix/Boleto instructions on the row
            <-- {ok, redirectUrl: /checkout/confirmacao?ref=<reference>}  or  {ok:false, code, ...}
        browser --> /checkout/confirmacao?ref=   (first paint resolved server-side, then polls
                                                  /billing/status every ~2 s)
Appmax --> POST /billing/webhook (event hint) --> refetch GET /v1/orders/{id} --> CAS update
                                                  amount check: amounts.sub_total vs amount_cents
```

Card: `autorizado` means antifraud review, not paid; the row stays `pending` until `order_approved`
(refetch `aprovado`/`integrado`). A declined card (`payment_not_authorized`) fails synchronously and
the Cliente retries from the form.

## Modules and seams

- `modules/billing/appmax-client.ts`: the one outbound-fetch seam to Appmax. Gains environment
  selection (`APPMAX_ENV`), token handling, and functions `createCustomer`, `createOrder`,
  `payCreditCard`, `payPix`, `payBoleto`, `getOrder`. `createHostedCheckoutSession` is deleted in 02.
- `modules/billing/payment-provider.ts`: `IPaymentProvider` becomes a union on `checkout:
  'redirect' | 'own-form'`. Webhook handling stays out of it (ADR-0005).
- `modules/billing/checkout.ts`: `createCheckoutSession` becomes `resolveCheckout`, returning
  `redirect`, `form` or `unavailable`.
- `modules/billing/buyer-input.ts` (new, pure): name splitting, phone and CPF/CNPJ normalization
  and check digits, e-mail shape. Shared by the page script and the pay endpoint.
- `modules/billing/pay.ts` (new): the pay use case; calls `appmax-client` directly (one own-form
  provider exists, no second abstraction).
- `pages/checkout.astro` (replaces `pages/checkout.ts`), `pages/checkout/pay.ts` (new),
  `pages/checkout/confirmacao.astro` (new states), `pages/billing/status.ts`.
- `content/checkout-form.ts` (new) and `content/checkout-confirmation.ts` (extended): all copy,
  `launchBlocking` where unverified.
- `migrations/0012_payment_instructions.sql`: `purchases.payment_instructions` (JSON text).
- Config: `APPMAX_ENV` (`sandbox` default, `production` explicit), `APPMAX_EXTERNAL_ID`; both set in
  `wrangler.jsonc` / `.dev.vars.example`, `worker-configuration.d.ts` regenerated.

## Decisions carried by the tickets

- Card data never touches our Worker (ADR-0007); we never log request bodies of the pay route.
- `APPMAX_ENV` defaults to sandbox and only an explicit `production` switches hosts, the same
  fail-safe posture as `factory.ts` (a test deploy must never hit production money).
- One row per pay attempt, `purchases.id = reference`, inserted **before** calling Appmax so a
  retry of the same POST cannot double-create, and the Appmax order id is written before the
  payment call so a paid order always has a row the webhook can find.
- Buyer name and document come from our form (`buyer_name`, `buyer_document`), then feed the
  existing NFS-e flow; the webhook's `COALESCE` keeps the first written. Phone and address are not
  stored by us.
- "Nome completo" is one field, split into first and last name server-side.
- Installments are 1 (no parcelamento in 0.1, PLANNING.md §6).

## Out of scope

- Mensal recurrence (09), removing the Stripe driver (10).
- Parcelamento, Apple Pay, Google Pay, saved cards, coupons, upsell, cart.
- Annual auto-renew (1.0.0).
- Backend tokenization (rejected, ADR-0007).
- Reconciling orders whose webhook was lost past Appmax's four attempts (about 6.5 hours): noted
  in 07 as a follow-up, not built.

## Testing decisions

- As everywhere in `modules/billing`, only `fetch` calls to Appmax (and Stripe) are mocked; D1 is
  real (vitest-pool-workers). Mocks are rebuilt from the documented shapes in PLANNING.md §13,
  so a green suite proves our code against the docs, not against Appmax: that is what 08 is for.
- TDD seams: `appmax-client` (request shape and response mapping per function), `buyer-input`
  (pure), `resolveCheckout` and `pay` (D1 rows and responses), confirmation view-model (pure),
  webhook mapping tables. Page markup is checked in the browser at 390 and 1280, not unit-tested,
  except content files (typed, shape tests like `catalog-page.test.ts`).
- The existing tests that mock `/payment-links` (`checkout.test.ts`, `e2e.test.ts`,
  `catalog-e2e.test.ts`) are rewritten to the new calls, not deleted.

## Open questions

- Does the sandbox require the address for digital goods, and which customer fields are really
  mandatory? Settled in 08; 04 builds without address.
- `qr_code` format (base64 image or URL), `data.order_id` field names in webhook payloads,
  whether `customer.document_number` comes back on every method: 08.
- IP: `CF-Connecting-IP` server-side or the value Appmax JS collects (05, verified in 08).
- Card-testing abuse of a public pay endpoint: rate limit (05) and whether to add Turnstile
  (owner decision, not taken here).
- IP filter on the webhook: Appmax publishes no source IPs, so `APPMAX_WEBHOOK_IPS` cannot be
  filled in. Owner decision before go-live whether to keep fail-closed (07 leaves it as is).
- Privacy and Termos must list the new personal data before launch (04 flags it; text is a
  lawyer's, PLANNING.md §9).
