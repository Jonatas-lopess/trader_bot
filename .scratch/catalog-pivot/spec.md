# catalog-pivot

Status: done

Pivot from Planos (Starter/Pro/Enterprise) to a Catálogo of Robôs. Decisions were settled in a
grilling session on 2026-09-29 and recorded in [ADR-0006](../../docs/adr/0006-catalog-pivot.md);
that ADR is the source of truth, this spec only turns it into work. Docs-only pass done first
(CONTEXT.md, PLANNING.md, ADR-0006); everything below is code and remaining copy.

Governing docs: ADR-0006, PLANNING.md §1, §4, §6 (Price integrity, Purchase status ranking),
§8, §9, §10; CONTEXT.md (Catálogo, Oferta, Compra, Assinatura, Licença).

## Decisions in one page

- Catálogo, first-party only. Each Robô: slug + up to three Ofertas.
- Compra (main): one payment, perpetual Licença, card/Boleto/Pix. Anual: one payment, 12
  months, no auto-renew in 0.1, card/Boleto/Pix. Mensal: recurring, card only.
- One Robô per checkout. One active Licença per Cliente per Robô.
- Catalog is `src/content/catalog.ts` (typed, bundled, `launchBlocking` placeholders).
- Checkout takes only `robot_id` + `offer`; price server-side; `amount_cents` stored on the
  purchase; webhook compares reported amount to stored amount; mismatch → `rejected`.
- `subscriptions` → `purchases`. Status rank: `pending` < `rejected` < `active` < `past_due` <
  `canceled` < `refunded` < `chargeback`.
- `licenses` keyed by `purchase_id`, gains `robot_id`, nullable `corretora_account`; status
  `awaiting_account` → `preparing` → `active`. Expiry derived from purchase status by one
  function.
- Corretora account entered in the customer area after payment; blocks download; per-Licença
  compiled binary, compiled manually in 0.1 (`licenses/<license_id>.ex5`; source in
  `robots/<slug>/`).
- 7-day withdrawal honored: manual refund, Licença revoked.
- `/catalog` replaces `/planos` (redirect). Migration `0008` drops and recreates plan-keyed
  tables; no production data exists.

## Out of scope (1.0.0)

Annual auto-renew + reminder email; automated compile/issuance; rental-to-Compra conversion;
cart; per-Robô detail pages; live check-in enforcement (stays in `license-server`).

## Open

- Real Robôs, names, prices: placeholders until supplied. Everything ships `launchBlocking`.
- Appmax: yearly interval and charged-amount field are now documented (`interval: "year"`,
  `amounts.sub_total` on `GET /v1/orders/{id}`); both still need a sandbox call (PLANNING §13).
  Driver endpoints, webhook envelope and status mapping findings are in tickets 02–05.
- Corretora-account form has no Figma frame; design it from the existing customer-area styles.
