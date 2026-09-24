# NFS-e issuance (manual, 0.1)

0.1 issues notas fiscais manually through the municipal portal, one sale at a time. No
integration, no dedicated issuer — that's 1.0.0 scope (PLANNING.md §10). This is the ops
runbook for the manual process.

Nothing here is tax advice. ISS rules and rates are municipal; confirm every `TODO` below
with the contador before relying on it (PLANNING.md §9).

## When to issue

One nota per successful Assinatura charge (initial or renewal) — a payment Appmax reports
as confirmed. Trigger point: `TODO — confirm with contador` (options: same day as the
webhook lands the Assinatura in `active`, or batched at a fixed point in the billing cycle —
municipal portals commonly expect a `competência` date, which may push toward batching
rather than per-event issuance).

## Data needed per nota

Pull from the D1 `customers`/`subscriptions` tables (`modules/identity`,
`modules/billing`) and the matching Appmax payment record:

- Cliente name and CPF/CNPJ
- Plano and price charged (the actual charged amount, not list price — check for any
  discount/coupon applied)
- Payment date / `competência` date
- Service description — `TODO — confirm the exact wording the contador wants on the nota`
  (municipal portals usually require a specific activity code + description, not free text)

## Steps

1. `TODO — confirm with contador`: municipal portal URL, login/access method (CNPJ access,
   certificado digital, or portal-issued credentials).
2. Enter the Cliente and service data above.
3. Enter/confirm the ISS rate. `TODO — confirm with contador`: rate is municipal
   (PLANNING.md §9) and not yet recorded anywhere in this repo.
4. Issue the nota, save the resulting PDF/XML.
5. Record what was issued — `TODO — confirm with contador`: whether the municipal portal is
   the system of record, or whether ops should also log issuance somewhere in this repo
   (e.g. a column on the subscription row) for reconciliation against Appmax volume.

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
