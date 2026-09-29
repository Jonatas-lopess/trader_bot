# NFS-e issuance (manual, 0.1)

0.1 issues notas fiscais manually through the municipal portal, one sale at a time. No
integration, no dedicated issuer — that's 1.0.0 scope (PLANNING.md §10). This is the ops
runbook for the manual process.

Nothing here is tax advice. ISS rules and rates are municipal; confirm every `TODO` below
with the contador before relying on it (PLANNING.md §9).

## When to issue

One nota per confirmed payment (a Compra, an Anual, or each Mensal charge) — a payment Appmax reports
as confirmed. Trigger point: `TODO — confirm with contador` (options: same day as the
webhook lands the Assinatura in `active`, or batched at a fixed point in the billing cycle —
municipal portals commonly expect a `competência` date, which may push toward batching
rather than per-event issuance).

## Data needed per nota

Everything comes from D1 (`purchases`, ticket catalog-pivot 13), written by the webhook
from the authoritative order refetch, never from the webhook payload. Run it with
`wrangler d1 execute <db> --remote --command "<query>"`:

```sql
SELECT id AS purchase_id,
       buyer_name,
       buyer_document,
       amount_cents,
       offer,
       robot_id,
       paid_at,
       nfse_issued_at
FROM purchases
WHERE status IN ('active', 'past_due', 'canceled')
  AND paid_at IS NOT NULL
  AND nfse_issued_at IS NULL
ORDER BY paid_at;
```

- `buyer_name` and `buyer_document` (CPF 11 or CNPJ 14 digits, digits only). A `NULL`
  `buyer_document` means the gateway returned none (Sentry: "no buyer document on the
  authoritative response", purchase id only). Get it from the Appmax order screen or from
  the Cliente by email, then `UPDATE purchases SET buyer_document = '<digits>' WHERE id = '<purchase_id>'`.
- `amount_cents` is the nota basis: the price of the service (Appmax `amounts.sub_total`),
  not `total_paid`, which includes the card installment fee. `TODO — confirm with contador`
  that the nota is issued on the service price alone. It is the amount charged unless a
  discount/coupon applied, which the amount check would have rejected.
- `offer` (`one_time`, `annual`, `monthly`) and `robot_id`: what was sold.
- `paid_at` is the first time the purchase landed `active`; use it as the payment /
  `competência` date. Refunded and chargeback purchases are excluded on purpose:
  `TODO — confirm with contador` whether a nota already issued for one must be cancelled.
- Service description — `TODO — confirm the exact wording the contador wants on the nota`
  (municipal portals usually require a specific activity code + description, not free text)

The document is personal data (LGPD): do not paste it into chat, tickets or logs.

## Steps

1. `TODO — confirm with contador`: municipal portal URL, login/access method (CNPJ access,
   certificado digital, or portal-issued credentials).
2. Enter the Cliente and service data above.
3. Enter/confirm the ISS rate. `TODO — confirm with contador`: rate is municipal
   (PLANNING.md §9) and not yet recorded anywhere in this repo.
4. Issue the nota, save the resulting PDF/XML.
5. Record what was issued: `UPDATE purchases SET nfse_issued_at = '<YYYY-MM-DD>' WHERE id = '<purchase_id>'`,
   so the query above shows only unissued notas. `TODO — confirm with contador` whether the
   municipal portal is the system of record too.

## MEI ceiling watch

MEI is exempt from issuing to a *pessoa física* buyer but not to a PJ buyer, and MEI's R$81k
annual ceiling is crossed at roughly 70 Starter customers (PLANNING.md §9). Ops should watch
customer count against that threshold — `TODO — confirm with contador` what changes (regime,
obligations) once it's crossed, and who's responsible for tracking it.

## Status

Contador is engaged (PLANNING.md §12) but hasn't returned the specifics marked `TODO` above.
This doc unblocks 0.1 ("manual NFS-e process documented") as a structure to fill in, the
same way legal pages ship with placeholder text carrying TODOs (PLANNING.md §9) rather than
waiting on real content to ship the scaffold.
