# Appmax as the payment gateway

Supersedes [ADR-0001](0001-pagarme-como-gateway.md). We sell a BRL subscription to
Brazilian customers; Appmax was not evaluated when ADR-0001 chose Pagar.me over Stripe. On
review it clears every reason Stripe was rejected — native Visa, Mastercard, Elo,
Hipercard and Amex acceptance, no card coverage gap — and its published prohibited-products
policy is narrower and more specific than Stripe's: it bans sale of equity/business/
investment stakes and pyramid/MLM schemes, not a broad "promises high rewards" clause. A
trading-automation tool is not squarely "venda de investimento," but the category is still
disclosed in writing during onboarding (§12) because the line is a human reviewer's call,
not a bright one.

Appmax also removes a Pagar.me-specific constraint: it supports parcelamento (up to 21x) on
recurring charges, which Pagar.me's API forbids (`installments` must be `1` for
subscriptions). This does not by itself move parcelamento into 0.1 scope — that stays a
product decision — but the technical blocker ADR-0001 cited no longer applies to the
gateway.

## Considered options

**Staying on Pagar.me.** No card-coverage or category-risk problem, but subscriptions
can't carry installments, and its restricted-business policy is undocumented publicly (no
list comparable to Stripe's or Appmax's was found — PLANNING.md §13).

**Stripe.** Rejected for the same reasons as ADR-0001: Brazilian card acceptance excludes
Elo, Hipercard, local debit; category risk from the "get rich quick" prohibited-business
clause.

**Asaas, Iugu, PagBrasil, Efí.** Not re-evaluated here; ADR-0001's reason to reject them
(recurring Pix not required) is unchanged.

## Consequences

- **Same webhook posture as Pagar.me.** Appmax documents subscription webhook events
  (creation, cancellation, recurring charge) but not signature verification, retry policy
  or ordering guarantees. Webhooks stay hints; every one triggers a re-fetch of
  authoritative state from the API.
- **Settlement is still D+30 by default**, with a 1.49% fee for D+1 advance — no
  improvement over Pagar.me on cash-flow timing.
- **Fee shape changes.** Card is 3.49% + 1.89% per installment (4.99% + 2.49% below R$100k
  monthly revenue), plus a flat R$0.99 gateway/anti-fraud fee per transaction and a 1% MDR
  surcharge on brands other than Visa/Mastercard. Boleto is a flat R$3.49, not a percentage.
  Pix is 0.99%. Re-cost the pricing page (PLANNING.md §6) against these, not the Pagar.me
  figures.
- **Chargeback recovery carries a 15% fee** on the recovered amount when Appmax's active
  collection succeeds. Dispute handling is otherwise between merchant and Appmax, unlike
  Pagar.me where it runs through the acquirer directly.
- **Recurring Pix is still not offered.** Appmax does not appear among providers with a
  shipped merchant-side Pix Automático API; ADR-0001's rails-limitation reasoning (not a
  vendor gap) carries over unchanged.
- **Onboarding is still a gate.** Disclose the product category in writing during risk
  analysis and keep the approval on record (PLANNING.md §12).
