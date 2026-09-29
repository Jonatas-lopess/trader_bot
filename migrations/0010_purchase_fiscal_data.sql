-- Catalog pivot — .scratch/catalog-pivot/issues/13-fiscal-data-for-nfse.md.
-- So the operator can issue each manual NFS-e (docs/ops/nfse.md) from D1 alone.
--
-- `buyer_name` / `buyer_document` come only from the authoritative order refetch
-- (never the webhook payload); `buyer_document` is digits only (CPF 11 / CNPJ 14),
-- NULL when the gateway returned none or a malformed one. Both are personal data
-- (LGPD): never log them. `paid_at` is set once, the first time the purchase lands
-- `active`. `nfse_issued_at` is set by hand after the nota is issued, so unissued
-- notas are `WHERE nfse_issued_at IS NULL`.
--
-- The nota basis is `amount_cents` (Appmax `amounts.sub_total`: the price of the
-- service), NOT `total_paid`, which includes the card `installment_fee`. Confirm the
-- basis with the contador (nfse.md).
ALTER TABLE purchases ADD COLUMN buyer_name TEXT;
ALTER TABLE purchases ADD COLUMN buyer_document TEXT;
ALTER TABLE purchases ADD COLUMN paid_at TEXT;
ALTER TABLE purchases ADD COLUMN nfse_issued_at TEXT;

-- Rows paid before this migration: `updated_at` is the closest recorded date, so the next
-- event does not stamp `paid_at` with the wrong (later) date.
UPDATE purchases SET paid_at = updated_at WHERE paid_at IS NULL AND status IN ('active', 'past_due', 'canceled');
