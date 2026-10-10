# Own checkout form on Appmax, no hosted checkout

Status: Accepted (2026-10-09). Reverses the "Hosted Checkout in 0.1" paragraph of PLANNING.md §6.
Does **not** supersede [ADR-0003](0003-appmax-como-gateway.md) (Appmax stays the gateway),
[ADR-0005](0005-stripe-test-driver.md) (the Stripe test driver stays, see below) or
[ADR-0006](0006-catalog-pivot.md) (price integrity is unchanged).

## Context

PLANNING.md §6 planned a hosted checkout: send the Cliente to an Appmax page that collects
payment, then back to our confirmation page. `appmax-client.ts` was written against that
plan, from guessed field names (`POST /payment-links` with `return_url`, `external_id`,
`payment_methods`, `recurring`). Reading docs.appmax.com.br on 2026-10-09 shows the premise
is wrong: Appmax has no Stripe-style hosted checkout session.

What it has is a shareable payment link, `POST /v1/payment-link` (singular), returning
`data.checkout_url`. It takes `name`, `value` (minimum 500 cents), `description`,
`payments`, `max_installments`, `allow_multiple_sales`. The docs show no return URL and no
external reference, and the link is not tied to one Cliente or one attempt: orders it
produces are found by polling `GET /v1/payment-link/{id}/orders`, and an order carries no
field pointing back to the link. Nothing documents a recurring option on it. That is a
"share this URL with a buyer" product, not a per-checkout session we can redirect to and
come back from with our `reference`. All of this is read from the docs, not sandbox-verified
(PLANNING.md §13).

## Decision

**We build our own checkout form and drive Appmax's API directly.** The route
`/checkout?robot=<slug>&offer=<offer>` renders our page for Appmax; the server then runs
customer, order, payment (`POST /v1/customers`, `/v1/orders`, `/v1/payments/...`). This also
lets us collect the buyer's name, e-mail and CPF/CNPJ ourselves, which the NFS-e flow
(catalog-pivot 13) needed anyway.

Decisions taken by the owner on 2026-10-09:

- **Card data is tokenized in the browser by Appmax JS, never by our Worker.** The form
  carries `data-appmax-checkout` with fields named `card-number`, `card-holder-name`,
  `exp-month`, `exp-year`, `cvv`; the page calls `init({externalId, onTokenize, onError})`
  from `https://scripts.sandboxappmax.com.br/appmax.min.js` (production host: same path
  without `sandbox`). PAN and CVV never reach our Worker, so PCI scope stays near zero, the
  property the hosted checkout was chosen for. The backend-tokenize endpoint
  (`POST /v1/payments/tokenize`) exists and is **rejected**: it would put card data through
  our Worker and logs.
- **Scope: Compra and Anual first**, card, Pix and Boleto. **Mensal recurrence is deferred**
  to its own ticket (the subscription is created from an already approved order, a
  different flow).
- **The Stripe test driver stays for now.** Stripe keeps its redirect flow; the seam only
  learns that a provider may use our own form instead of a redirect. Removing the driver is a
  later ticket, after Appmax is verified in the sandbox.

**Price integrity (ADR-0006) is unchanged and easier to state.** The client sends
`robot` + `offer` only; the server prices from `src/content/catalog.ts`, writes
`amount_cents` on the purchase row, and the webhook compares the amount reported by
`GET /v1/orders/{id}` (`amounts.sub_total`, cents) against the stored value. The buyer form
adds fields, none of them price-bearing; anything price-like in the request body is ignored.

**Client IP.** Appmax requires the buyer's IP on customer creation and says it is collected
by Appmax JS on the page. The sandbox accepts `127.0.0.1` as a fallback; production
requires the real IP. We can also read it server-side from `CF-Connecting-IP`. Which one we
send (and whether both) is decided in the pay-endpoint ticket, against the sandbox.

## Consequences

- **More before the payment button.** PLANNING.md §7 says every field ahead of the button
  costs conversion. The form now asks for name, e-mail, phone and CPF/CNPJ (address only if
  the API requires it for digital goods, unverified). The account itself is still
  provisioned from payment, with no password and no sign-up step.
- **PCI near zero, but not zero.** The page loads a third-party script and our origin serves
  the form; a compromised page could still skim the fields. Keep the page free of other
  third-party scripts.
- **`appmax-client.ts` is rewritten.** Its paths lacked the `/v1` prefix and
  `/payment-links` was invented; the new client follows the documented endpoints and picks
  sandbox or production hosts by environment.
- **`IPaymentProvider.createCheckoutSession` is no longer the only entry.** It returns a
  `checkoutUrl` to redirect to, which fits Stripe and not an own-form provider. The seam
  change is its own ticket.
- **Two environments carry different `externalId`s** (the app installation id). Using the
  wrong one answers 404 "Merchant not found". It is configuration, not a secret, but it must
  match the host in use.
- **The confirmation page grows states.** Pix (QR, copy-paste code, expiry) and Boleto
  (PDF, digitable line, due date) have to be shown by us, and a card payment can sit in
  antifraud review (`autorizado`) until the webhook confirms.
- **Webhook posture is unchanged**: no HMAC, source IPs not published, every event is a
  hint that triggers an authoritative refetch.
- **Privacy and Termos copy must name the data we now collect** (name, CPF/CNPJ, phone,
  IP). Placeholder legal text stays placeholder (PLANNING.md §9), but the form must not
  ship to production with the data inventory missing.

## Considered and rejected

**Appmax payment link (`POST /v1/payment-link`).** No documented way to correlate a paid
order to our purchase row other than polling the link's orders, no return URL, no
recurrence, and a R$5 minimum. We could not hand our `reference` through or send the Cliente
back to the confirmation page.

**Tokenizing on the backend** (`POST /v1/payments/tokenize`). Simpler page, but PAN and CVV
cross our Worker, which puts us in real PCI scope and risks the data landing in logs or
Sentry. Rejected by the owner.

**Keeping Stripe as the only checkout until Appmax is sandbox-verified.** Stripe is
test-only (ADR-0005) and card-only; it cannot exercise Pix or Boleto, which are most of the
Anual path.
