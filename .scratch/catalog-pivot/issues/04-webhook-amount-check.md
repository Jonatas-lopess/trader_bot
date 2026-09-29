# 04: Webhook amount check and the rejected state

**Blocked by:** 02, 03

**Status:** ready-for-agent

**What to build:** in the Appmax and Stripe webhook paths, after the authoritative refetch, compare the reported charged amount to `purchases.amount_cents` (never the live catalog). Mismatch: compare-and-swap to `rejected`, report to Sentry with purchase id, expected and reported amount. Confirmation page and status endpoint gain a `rejected` branch: placeholder `launchBlocking` copy saying payment was received and is under review, link to support, **no** prompt to buy again (the Cliente was charged). Operator release (flip to `active`) is manual SQL/dashboard in 0.1; document it in `docs/ops/`.

Governing docs: ADR-0006 "Server-side price, amount verified after payment", PLANNING.md §6 Price integrity.

- [ ] Matching amount activates; mismatched amount lands `rejected`
- [ ] Catalog price edited between session creation and payment does NOT flag a legit payment
- [ ] A late legitimate event cannot flip `rejected` back to `pending` (rank), but can reach `active`
- [ ] Sentry capture test; confirmation-page copy is `launchBlocking`
- [ ] Verify the reported-amount field name against a real sandbox call (PLANNING §13), or note it unverified in the client header comment


## Appmax findings (2026-09-29, docs.appmax.com.br)

**Reported-amount field.** Refetch `GET /v1/orders/{order_id}` (merchant credentials). Response carries `amounts{sub_total, shipping_value, discount, installment_fee}` and `total_paid`. Compare `amounts.sub_total` to `purchases.amount_cents`, not `total_paid`: installments add `installment_fee`, so `total_paid` would reject legitimate card payments. Verify in sandbox that `sub_total` equals the sent `unit_value` (shipping 0, discount 0). Webhook order events carry `total`, `interest`, `discount`, `freight_value` (cents) too, but the payload is never trusted (refetch is authoritative).

**Webhook envelope** (docs/guides/webhooks): `{event, event_type, site_id, app_id, data{...}, partner_merchant}`. `order_id`/`subscription_id` sit inside `data`, not at the top level as `parseWebhookPayload` reads them today: every real delivery currently parses to `null` and is dropped with a 200. Ids may be numbers. Verify against the raw page/a sandbox delivery, then fix the parser.

**Delivery constraints.** 5s timeout, 4 attempts (immediate, +30min, +2h, +4h), no signature. Today `claimIdempotency` runs before the refetch and D1 write, and a failed refetch returns 200: a timeout or failed refetch makes the retry a "duplicate" and the event is lost. Claim the key only once processing succeeds, or answer fast and process in `ctx.waitUntil`.

**Status mapping** (order `status`):

| Appmax | Ours |
|---|---|
| `pendente`, `autorizado` | `pending` |
| `aprovado`, `integrado`, `pendente_integracao` | `active` |
| `estornado`, `recusado_por_risco` | `refunded` |
| `chargeback_em_tratativa`, `chargeback_em_disputa`, `chargeback_perdido` | `chargeback` |
| `cancelado` (declined card, expired Pix, panel order without payment) | no change (stays `pending`) |
| `pendente_integracao_em_analise` (paid, refund requested before integration) | no change, Sentry report for the operator |
| `chargeback_vencido` (dispute won) | stays `chargeback`; operator restores manually |

Subscription resource uses `ACTIVE`/`CANCELLED` (and possibly paused states; full list unknown). Old mapper sent `cancelado` to `canceled`, which outranks `active`: must not survive.

**Retry path for `cancelado`/never-paid.** Mapping to `pending` is only harmless if the Cliente can retry. Today each `/checkout` call mints a fresh purchase row (new `reference`), so a retry is simply a new checkout from the catalog; the old row stays `pending` forever, which is inert. But the confirmation page has no way out: `pending` polls forever and the timeout copy says "continue nesta página". Add:

- [ ] Pending-timeout copy on the confirmation page links back to `/catalog` ("tentar novamente") and support; the link starts a new checkout, never resumes the old row
- [ ] Stale `pending` rows do not block a new checkout or count toward the one-active-Licença rule
