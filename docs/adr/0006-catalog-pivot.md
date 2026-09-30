# Pivot from Planos to a Robô catalog

Status: Accepted (2026-09-29). Supersedes the Plano model in PLANNING.md §1, §6, §8, §10
and CONTEXT.md. Does **not** supersede [ADR-0003](0003-appmax-como-gateway.md) (Appmax stays
the gateway) or [ADR-0004](0004-license-verification-scheme.md) (per-license HMAC scheme
unchanged; it now verifies per-Licença, which is what it already assumed).

## Context

The site sold one Robô through three Planos (Starter, Pro, Enterprise) that differed only by
entitlement counts ("1 / 3 / ilimitados robôs ativos", "corretoras vinculadas"). Two things
made that unsustainable: the counts were unenforceable (PLANNING §8) and their meaning was
never settled (CONTEXT.md open terms *Robô ativo*, *Corretora vinculada*), and the business
intends to sell more than one Robô. The unit of sale should be the Robô, not a tier.

## Decision

**Catálogo of Robôs, first-party only.** Each Robô has a slug and up to three Ofertas:

| Oferta | Payment | Licença | Methods |
| --- | --- | --- | --- |
| Compra (main) | one payment | perpetual (far-future `expires_at`) | card, Boleto, Pix |
| Anual | one payment | 12 months, no auto-renew in 0.1 | card, Boleto, Pix |
| Mensal | recurring | renewed by each payment | card only |

Plano is removed from the domain. Planos' entitlement axes vanish: **one Licença = one Robô =
one Corretora account**. This resolves *Robô ativo* and *Corretora vinculada*.

**One Robô per checkout.** No cart. Multi-item needs line items and partial-fulfilment rules,
and Boleto's one-day confirmation makes partial states ugly.

**One active Licença per Cliente per Robô.** Rental-to-Compra conversion is deferred to 1.0.0
with upgrade/downgrade.

**Server-side price, amount verified after payment.** Checkout accepts only `robot_id` +
`offer` from the client; price comes from the catalog and the amount is stored on the
purchase row (`amount_cents`) at session creation. The webhook compares the amount the gateway
reports against the stored amount, not the live catalog, so a catalog edit mid-payment cannot
false-flag a legitimate payment. Mismatch moves the purchase to `rejected`, reports to Sentry,
and the confirmation page says payment was received and is under review. The Cliente *was*
charged, so copy never says otherwise and never invites a second purchase. Operator resolves
manually in 0.1 (release or refund via Appmax).

**Purchase table and status ranking.** `subscriptions` is replaced by `purchases` (one row per
checkout attempt: `robot_id`, `offer`, `amount_cents`, `status`, gateway ids). Status is
rank-ordered by the existing compare-and-swap rule: `pending` < `rejected` < `active` <
`past_due` < `canceled` < `refunded` < `chargeback`. A lower-ranked event can never overwrite
a higher one. `licenses` is keyed by `purchase_id` and gains `robot_id`. Licença expiry is
derived from purchase status through one function: `canceled` keeps the term already paid;
`refunded` and `chargeback` set expiry to now.

**Withdrawal.** CDC art. 49 (7-day *arrependimento*) is honored: manual refund via Appmax in
0.1, Licença revoked by expiry-to-now. Termos de uso carries the clause (placeholder text,
real wording from a lawyer).

**Catalog data is a typed content file** (`src/content/catalog.ts`), not a D1 table. It ships
inside the Worker bundle with no runtime write path; only repo or CI access can change it,
and that access already controls all code. D1 stores only `robot_id` on each purchase. Move
to D1 only when non-developers need to edit it.

**Corretora account is collected after payment, not at checkout.** The Cliente enters it in
the customer area per Licença. It is needed to compile the Licença's binary, so it is shown
explicitly there and blocks download until set. Not collected at checkout, so conversion is
untouched. `licenses.corretora_account` is nullable, set once by the Cliente, changed only by
the operator in 0.1. Live check-in enforcement stays in the `license-server` effort.

**Per-Licença compiled binary, manual in 0.1.** The account is baked into the binary, so each
Licença gets its own compile. Licença status gains `awaiting_account` before `preparing`:
`awaiting_account` → `preparing` → `active`. The operator compiles from
`robots/<slug>/` (source, never served) and uploads `licenses/<license_id>.ex5`. Download
tokens carry `license_id`. Consistent with PLANNING §8: issuance has a human in it.

**Reset, not migrate.** Only test-phase data exists. Migration `0008` drops and recreates the
plan-keyed tables.

**Routes.** `/catalog` replaces `/planos`; `/planos` redirects to `/catalog`. No per-Robô
detail pages until a second real Robô exists.

**Identity is per email.** Amended after the pivot: `customers` is keyed by normalized email,
not by purchase, so a repeat buyer has one login reaching every Licença (ticket 14).

## Deferred to 1.0.0

- Annual auto-renew (card only; Pix and Boleto can never auto-charge) and the reminder email
  that must accompany it (15 days before renewal, CDC exposure otherwise). Until then annual
  never auto-renews for any method.
- Automated compile/issuance per Licença, researched with the license authority.
- Rental-to-Compra conversion.
- Appmax documents a yearly interval (`interval: "year"`); sandbox confirmation pending (PLANNING §13).

## Consequences

- Rewrites tickets across `checkout-webhooks`, `customer-area`, `robot-delivery`,
  `license-server`, `marketing-pages` (tracked in `.scratch/catalog-pivot/`).
- `subscription_id` disappears as the join key; `purchase_id` replaces it everywhere.
- PLANNING §6's "Boleto recurring" claim is dropped: recurring is card only.
- Annual's "Economize 20%" and Pix steer survive; the price and badge remain `launchBlocking`
  until the business sets real numbers.
- Catalog entries are placeholders (`launchBlocking`) until real Robôs and prices exist.
