# 05: Derive Licença expiry from purchase status

**Blocked by:** 02

**Status:** ready-for-agent

**What to build:** one pure function (in `modules/licensing/`) mapping a purchase to a Licença expiry, used everywhere expiry is written. Compra: far-future sentinel. Anual: paid date + 12 months. Mensal: end of the paid period. `canceled`: keeps the term already paid. `refunded`/`chargeback`: now. Wired so status transitions (webhook, cancel) update the Licença in the same atomic path; nothing edits `expires_at` independently. Sentinel value and its display ("vitalícia" in the customer area) defined once.

Governing docs: ADR-0006, CONTEXT.md Licença.

- [ ] Table-driven tests over every offer × status
- [ ] Refund after Compra sets expiry to now and cannot be undone by a lower-ranked event
- [ ] `pnpm test` and `pnpm run typecheck` pass


## Appmax findings (2026-09-29, docs.appmax.com.br)

`PATCH /v1/subscriptions/{id}/cancel` (merchant credentials, optional body `{reason}`) is **immediate**: status `CANCELLED`, `canceled_at` set, no further charges, no end-of-period grace. "`canceled` keeps the term already paid" is therefore entirely our rule: derive the expiry from the last successful charge (`charges[].charged_at` from `GET /v1/subscriptions/{id}`) plus one period, not from `canceled_at`. Current driver uses `POST /subscriptions/{id}/cancel`, wrong method and path.
