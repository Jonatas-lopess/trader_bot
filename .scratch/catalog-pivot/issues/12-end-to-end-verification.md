# 12: End-to-end verification

**Blocked by:** 03, 04, 07, 08

**Status:** done

**What to build:** Playwright happy path from `/catalog` to a downloaded per-Licença binary: choose Compra, pay (Stripe test driver), confirm, log in, enter Corretora account, operator flips `active`, download. Plus branches: Boleto pending, amount-mismatch `rejected` page, Mensal cancel, refund revokes the Licença.

- [x] Happy path and the four branches green
- [x] `pnpm test` and `pnpm run typecheck` pass


## Notes

`src/modules/licensing/catalog-e2e.test.ts`. "Playwright" follows the repo precedent (`identity/e2e.test.ts`): no browser dependency exists, so this drives the real module functions against real D1 and R2, mocking only Appmax and Resend `fetch`. The Appmax driver stands in for Stripe's test driver; everything past the driver seam is identical.

- Happy path: checkout (price from catalog, stored) → paid webhook (amount matches; `buyer_name`, `buyer_document`, `paid_at` persisted) → `awaiting_account` → login → Corretora form → `preparing` → binary upload → `activateLicense` → emailed link redeemed, bytes match → `estornado` refund → minted link 404s and `/conta` shows `revoked`.
- Branches: Boleto pending then paid; amount mismatch → `rejected`, no Licença or Cliente; Mensal activates, cancel flips it, Licença row kept.
- Covers the Appmax driver only. What no test can settle stays in PLANNING §13 (sandbox): `payment_methods`/`recurring` fields, `amounts.sub_total` unit, Mensal two-step flow, `customer.document_number` per method.
