# 09: Mensal recurrence on the own checkout

**Type:** research, then implementation tickets.

**What to build:** Make the Mensal Oferta (card only, ADR-0006) work on the own form. Today the Appmax path returns `unavailable` for Mensal (02) while the Stripe test driver still sells it.

Findings so far (docs.appmax.com.br, 2026-10-09, not sandbox-verified). The URL guessed earlier, `/api-reference/recorrencia/criar-recorrencia`, does not exist; the documented section is **Assinaturas**, reached from `/api-reference/introduction`: `/api-reference/subscriptions/criar-assinatura`, `.../cancelar-assinatura`, `.../consultar-assinatura`, pause/reactivate, `alterar-forma-pagamento`, `alterar-periodicidade`, and others.

- `POST /v1/subscriptions` `{order_id, interval, interval_count, max_cycles, ...}` creates a subscription **from an existing order**: the order must belong to our store, be paid by card or Pix, and already be `aprovado` or `integrado` (past antifraud). Customer and card come from that order. The response carries `id`, `status`, `next_charge_at`, `charge_day`, `fail_max_tries`, `fail_interval_hours`, `completed_cycles`, `charges[]`.
- So Mensal on our form is: the first period is a normal card payment (the same order flow as Compra); once the webhook shows the order approved, **we** create the subscription from that order for the following cycles. That means the subscription creation happens inside the webhook path, needing its own idempotency, and a failure mode where the first payment succeeded and the subscription call failed (the Cliente paid once and will not renew).

Open questions that need an answer before building (hence `needs-info`):

- Allowed `interval` values and the unit of `interval_count`; whether the first charge counts as cycle 1 or the subscription starts a month later (a Cliente must not be charged twice in a month, nor skip a month).
- How renewals show up: a new order per cycle with the same `subscription_id`, which webhooks (`subscription_*`, `order_paid`), and how `purchase-lookup.ts`'s `appmax_subscription_id` matching and `licenseSyncStatement` handle a renewal (the Licença is renewed by each payment, CONTEXT.md).
- Whether Pix as base order is accepted (docs say so, PLANNING.md §6 says Mensal is card only; keep card only).
- Retry/dunning: `fail_max_tries`/`fail_interval_hours` defaults against our own multi-day dunning plan (PLANNING.md §6).
- The amount check for subscription responses (they carry no amount, 07/PLANNING backlog), and cancel semantics (`PATCH /v1/subscriptions/{id}/cancel`, immediate) against the existing `cancel.ts`.
- The 7-day withdrawal on Mensal covers only the first charge (existing `buyWithdrawalNote` caveat).

Output: findings appended to this file, then implementation tickets (pay endpoint support for Mensal, webhook renewals, `resolveCheckout` returning `form` for Mensal).

**Blocked by:** 05 (and sandbox answers from 08 for the open questions).

**Status:** needs-info

- [ ] Open questions answered from the docs or the sandbox, recorded below
- [ ] Implementation tickets written, each independently verifiable
