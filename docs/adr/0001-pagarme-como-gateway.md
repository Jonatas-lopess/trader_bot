# Pagar.me as the payment gateway

> **Superseded by [ADR-0003](0003-appmax-como-gateway.md).** Appmax was not in the
> considered-options list below when this was written; once evaluated it covered every
> reason Stripe was rejected here (native Elo/Hipercard/Amex, no comparable "get rich
> quick"/investment clause) and additionally supports parcelamento on recurring charges,
> which Pagar.me forbids (Consequences, below). Kept for history.

We sell a BRL subscription to Brazilian customers and chose Pagar.me over Stripe, despite
Stripe's substantially better developer experience, because Stripe's Brazilian card
acceptance is limited to Visa and Mastercard credit plus international debit — no Elo,
Hipercard, Amex or local debit — and because Stripe's *prohibited* business list covers
"'get rich quick' schemes, including investment opportunities or other services that
promise high rewards", which a reviewer applies to the marketing copy of a trading
automation product. Losing card coverage costs conversion on every sale; losing the account
costs the business, with domestic card receivables held at D+30 when it happens.

## Considered options

**Stripe.** Best-in-class Billing, Customer Portal, Smart Retries, signed webhooks, test
clocks, excellent TypeScript SDK. Rejected on card coverage and category risk. If it is
ever reconsidered, get written pre-approval from Stripe sales before launch and never hold
more float there than can be afforded frozen.

**Asaas, Iugu, PagBrasil, Efí.** The only providers with shipped merchant-side Pix
Automático APIs. Rejected because recurring Pix was decided not to be a requirement — card
and boleto carry the subscription, and annual plans are a single Pix charge.

## Consequences

- **We build what Pagar.me does not provide:** the customer self-service portal
  (cancellation is a CDC right and is promised in our own FAQ copy), multi-day dunning with
  its emails, and the retry-and-recover flow around failed payments.
- **Webhooks are treated as hints, not truth.** Pagar.me does not document signature
  verification, retry policy or ordering guarantees. Every webhook triggers a re-fetch of
  authoritative state from the API.
- **No parcelamento on subscriptions.** Pagar.me requires `installments` to be 1 for
  recurring charges, so any instalment offer means one-off orders plus our own renewal
  logic.
- **Onboarding is a gate, not a formality.** The product category must be disclosed in
  writing during risk analysis and the approval kept on record.
