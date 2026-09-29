# 02: Migration 0008: purchases, licenses, download_tokens

**Blocked by:** 01

**Status:** ready-for-agent

**What to build:** migration `0008` dropping and recreating the plan-keyed tables (no production data, ADR-0006). `purchases` replaces `subscriptions`: `robot_id`, `offer` (`one_time|annual|monthly`), `amount_cents`, `status` (`pending|rejected|active|past_due|canceled|refunded|chargeback`), `payment_method`, gateway ids. Update `STATUS_RIGIDITY_CASE_SQL` (`src/modules/billing/subscription-lookup.ts`) to the new ranking and every compare-and-swap that hard-codes rank thresholds (`cancel.ts` uses `<= 3`). `licenses` keyed by `purchase_id`, adds `robot_id`, nullable `corretora_account` (integer), status `awaiting_account|preparing|active`. `download_tokens` adds `license_id`. Rename `subscription` module vocabulary to `purchase` where it means the row, keep it where it means Assinatura.

Governing docs: ADR-0006 "Purchase table and status ranking", PLANNING.md §6 Purchase status ranking, migrations 0001/0005/0006.

- [ ] Migration applies cleanly on a fresh D1 and in the vitest pool
- [ ] Rigidity ranking test: every lower-ranked event fails to overwrite every higher status
- [ ] Existing tests updated, not deleted; `pnpm test` and `pnpm run typecheck` pass


## Appmax findings (2026-09-29, docs.appmax.com.br)

- Order statuses (pt-BR slugs) map to the ranking in ticket 04's "Status mapping"; `refunded` and `chargeback` are reachable only via `estornado`/`recusado_por_risco` and `chargeback_*`.
- Order and subscription resources use different status sets (orders `aprovado`…; subscriptions `ACTIVE`/`CANCELLED`). Split `mapAppmaxStatus` into one mapper per resource.
- `order_id` and `subscription_id` are integers on Appmax's side; store as text but do not assume string in payloads.
