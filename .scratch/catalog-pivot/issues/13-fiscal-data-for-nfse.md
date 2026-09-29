# 13: Persist fiscal data on the purchase for NFS-e

**Blocked by:** 02, 04

**Status:** done

**What to build:** so the operator can issue each manual NFS-e (`docs/ops/nfse.md`) from D1 alone, persist the buyer's name and CPF/CNPJ on the purchase and make the nota value unambiguous. Add `buyer_name` and `buyer_document` (digits only, nullable) to `purchases`, written in the same compare-and-swap path that ticket 04 uses after the authoritative order refetch (`GET /v1/orders/{order_id}` returns `customer.name`, `customer.email`, `customer.document_number`). Never read them from the webhook payload. If the refetch returns no document, leave it null, keep the purchase moving (money already moved) and report to Sentry with the purchase id only (no document, no name). Stripe driver: fill from the test fixture so both drivers stay covered. `amount_cents` stays the nota basis (`amounts.sub_total`, price of the service, not `total_paid` with `installment_fee`); state that in the schema comment. Add to `docs/ops/nfse.md` a copy-paste SQL query listing confirmed purchases with name, document, `amount_cents`, offer, paid date and a nullable `nfse_issued_at` (new column, set manually after issuing) so unissued notas are a `WHERE nfse_issued_at IS NULL`.

Governing docs: PLANNING.md §9, `docs/ops/nfse.md` "Data needed per nota", ticket 04 "Reported-amount field", CONTEXT.md.

- [x] Appmax refetch fixture with a customer document persists `buyer_name`/`buyer_document` (digits only)
- [x] Fixture without a document leaves both null, purchase still reaches `active`, Sentry event carries no PII
- [x] Payload-supplied document/name is ignored (tampered webhook test)
- [x] `nfse.md` query runs against the vitest D1 and returns the expected rows
- [x] `pnpm test` and `pnpm run typecheck` pass

## Decisions / Notes

- Migration `0010` adds `buyer_name`, `buyer_document`, `nfse_issued_at` and also `paid_at` (set once, first time the purchase lands `active`): the ticket's query needs a paid date and `updated_at` moves on every later event.
- Written in the webhook CAS as `COALESCE(column, ?)`: first stored value wins, so a later event can neither erase nor overwrite the data a nota was issued from.
- Mensal (subscription) purchases never carry a document from the subscription refetch (no customer object), and are not reported as missing; the operator query shows NULL and the document is entered by hand. Alphanumeric CNPJ (2026) is treated as absent for the same reason. Stripe checkout now sets `tax_id_collection`. Read only from the refetch: Appmax `data.customer.{name,document_number}` (order responses only; a subscription response has no customer), Stripe test driver `customer_details.{name,tax_ids[br_cpf|br_cnpj]}`.
- A document that is not 11 (CPF) or 14 (CNPJ) digits after stripping is stored as null, not as junk on a nota.
- Missing document on an `active` purchase: Sentry message with `provider` and `purchase_id` only (`reportMissingBuyerDocument`). It reads the stored column, so a renewal event without a customer does not re-report once filled.
- `email` also falls back to `data.customer.email`.
- The `nfse.md` query is tested by extracting its ```sql block from the runbook, so doc and test cannot drift. It includes `past_due`/`canceled` (paid once) and excludes `refunded`/`chargeback` pending the contador.
- Not done: the Política de privacidade placeholder still does not list name/CPF-CNPJ as collected data (`src/content/legal.ts`, "Dados coletados"); left for the real legal text pass.
- Still gated on the sandbox: `customer.document_number` non-null per payment method through the real flow (PLANNING §13).

## Comments

**Appmax findings (2026-09-29, docs.appmax.com.br, read via page fetch, not sandbox-verified):**

- `GET /v1/orders/{order_id}` response carries a `customer` object with `id`, `name`, `email`, `document_number`, plus `amounts.sub_total` and `total_paid`. This is the source for both fields.
- Appmax's native flow is customer -> order -> payment: `POST` customer (name, email, phone, ip required; `document_number` and address **optional**), then order with `customer_id`, then payment. Card payment requires `holder_document_number`; Boleto and Pix requirements not confirmed. So the document may be absent on Pix/Boleto orders. Verify in sandbox per payment method before trusting non-null.
- The driver's `POST /payment-links` hosted flow is unverified (ticket 03). Whether hosted checkout collects CPF/CNPJ for every method is unknown. If it cannot be guaranteed, the fallback is to drive customer -> order -> payment ourselves and collect the document on our own form, which changes ticket 03 scope and PCI posture (PLANNING §6). Decide after the sandbox call.
- The refetch summary of `customer.document_number` came from a page-fetch tool summary; re-read the endpoint page before coding.

**Open, contador:** nota basis (`sub_total` vs `total_paid`), issuance trigger, service description. Already listed in `nfse.md`; this ticket does not resolve them.

**Privacy:** the document is personal data (LGPD). Política de privacidade placeholder should list it as collected; never log it.

**Docs-only findings, no sandbox access yet (2026-09-29):** Pix requires `payment_data.pix.document_number` (`POST /v1/payments/pix`, CPF or CNPJ) and card requires `holder_document_number`, so the native API flow collects a document for those methods; Boleto page not read. This narrows, but does not remove, the "document may be absent" case, which now only applies to the hosted `payment-links` flow. Building this ticket does not need the sandbox (the Stripe driver covers it). Checking that `customer.document_number` is non-null for every payment method through the real flow is a pre-go-live gate, tracked in PLANNING §13.
