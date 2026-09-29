# 05: Derive Licença expiry from purchase status

**Blocked by:** 02

**Status:** done

**What to build:** one pure function (in `modules/licensing/`) mapping a purchase to a Licença expiry, used everywhere expiry is written. Compra: far-future sentinel. Anual: paid date + 12 months. Mensal: end of the paid period. `canceled`: keeps the term already paid. `refunded`/`chargeback`: now. Wired so status transitions (webhook, cancel) update the Licença in the same atomic path; nothing edits `expires_at` independently. Sentinel value and its display ("vitalícia" in the customer area) defined once.

Governing docs: ADR-0006, CONTEXT.md Licença.

- [x] Table-driven tests over every offer × status
- [x] Refund after Compra sets expiry to now and cannot be undone by a lower-ranked event
- [x] `pnpm test` and `pnpm run typecheck` pass


## Decisions / notes

- `src/modules/licensing/license-expiry.ts`: pure `deriveLicenseExpiry`, `LIFETIME_EXPIRY` sentinel (rendered "Vitalícia" by `conta.ts`), and `licenseSyncStatement`, batched with the status CAS in both webhooks.
- Annual/Compra are set once; Mensal extends (never shortens). The write is guarded by `purchases.status = <new status>`, so a blocked stale event cannot touch expiry.
- First `active` now creates the `licenses` row (status `awaiting_account`); ticket 07 owns the status transitions. `getLicenseStatus` now requires `status = 'active'` too, so an expiry alone no longer shows the Licença as active.
- Mensal period end is `now + 1 month` at the paid event, not the gateway's last-charge date (not available in the webhook payload); revisit with a sandbox call.
- Cancel writes nothing (`canceled` keeps the term); `cancel.ts` needed no wiring.

## Appmax findings (2026-09-29, docs.appmax.com.br)

`PATCH /v1/subscriptions/{id}/cancel` (merchant credentials, optional body `{reason}`) is **immediate**: status `CANCELLED`, `canceled_at` set, no further charges, no end-of-period grace. "`canceled` keeps the term already paid" is therefore entirely our rule: derive the expiry from the last successful charge (`charges[].charged_at` from `GET /v1/subscriptions/{id}`) plus one period, not from `canceled_at`. Current driver uses `POST /subscriptions/{id}/cancel`, wrong method and path.
