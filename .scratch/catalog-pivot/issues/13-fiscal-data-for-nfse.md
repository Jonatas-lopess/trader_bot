# 13: Persist fiscal data on the purchase for NFS-e

**Blocked by:** 02, 04

**Status:** ready-for-agent

**What to build:** so the operator can issue each manual NFS-e (`docs/ops/nfse.md`) from D1 alone, persist the buyer's name and CPF/CNPJ on the purchase and make the nota value unambiguous. Add `buyer_name` and `buyer_document` (digits only, nullable) to `purchases`, written in the same compare-and-swap path that ticket 04 uses after the authoritative order refetch (`GET /v1/orders/{order_id}` returns `customer.name`, `customer.email`, `customer.document_number`). Never read them from the webhook payload. If the refetch returns no document, leave it null, keep the purchase moving (money already moved) and report to Sentry with the purchase id only (no document, no name). Stripe driver: fill from the test fixture so both drivers stay covered. `amount_cents` stays the nota basis (`amounts.sub_total`, price of the service, not `total_paid` with `installment_fee`); state that in the schema comment. Add to `docs/ops/nfse.md` a copy-paste SQL query listing confirmed purchases with name, document, `amount_cents`, offer, paid date and a nullable `nfse_issued_at` (new column, set manually after issuing) so unissued notas are a `WHERE nfse_issued_at IS NULL`.

Governing docs: PLANNING.md §9, `docs/ops/nfse.md` "Data needed per nota", ticket 04 "Reported-amount field", CONTEXT.md.

- [ ] Appmax refetch fixture with a customer document persists `buyer_name`/`buyer_document` (digits only)
- [ ] Fixture without a document leaves both null, purchase still reaches `active`, Sentry event carries no PII
- [ ] Payload-supplied document/name is ignored (tampered webhook test)
- [ ] `nfse.md` query runs against the vitest D1 and returns the expected rows
- [ ] `pnpm test` and `pnpm run typecheck` pass

## Comments

**Appmax findings (2026-09-29, docs.appmax.com.br, read via page fetch, not sandbox-verified):**

- `GET /v1/orders/{order_id}` response carries a `customer` object with `id`, `name`, `email`, `document_number`, plus `amounts.sub_total` and `total_paid`. This is the source for both fields.
- Appmax's native flow is customer -> order -> payment: `POST` customer (name, email, phone, ip required; `document_number` and address **optional**), then order with `customer_id`, then payment. Card payment requires `holder_document_number`; Boleto and Pix requirements not confirmed. So the document may be absent on Pix/Boleto orders. Verify in sandbox per payment method before trusting non-null.
- The driver's `POST /payment-links` hosted flow is unverified (ticket 03). Whether hosted checkout collects CPF/CNPJ for every method is unknown. If it cannot be guaranteed, the fallback is to drive customer -> order -> payment ourselves and collect the document on our own form, which changes ticket 03 scope and PCI posture (PLANNING §6). Decide after the sandbox call.
- The refetch summary of `customer.document_number` came from a page-fetch tool summary; re-read the endpoint page before coding.

**Open, contador:** nota basis (`sub_total` vs `total_paid`), issuance trigger, service description. Already listed in `nfse.md`; this ticket does not resolve them.

**Privacy:** the document is personal data (LGPD). Política de privacidade placeholder should list it as collected; never log it.
