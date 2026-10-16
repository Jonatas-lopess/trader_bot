-- Own checkout on Appmax — .scratch/appmax-checkout/issues/05-pay-endpoint.md, ADR-0007.
--
-- What the Cliente needs to pay a Pix or a Boleto, as Appmax returned it on the payment call,
-- so the confirmation page can show it again on reload (ticket 06). JSON text:
--   Pix    {"qrCode", "emvCode", "expiresAt"}
--   Boleto {"pdfUrl", "digitableLine", "dueDate"}
-- NULL for a card (nothing to show) and for rows written before this migration. Untrusted
-- values from the gateway: the page validates them before rendering (06).
ALTER TABLE purchases ADD COLUMN payment_instructions TEXT;
