# 07: Webhook mapped to the real events and statuses

**What to build:** Align `parseWebhookPayload`, the event handling and the status mapping with what docs.appmax.com.br documents (PLANNING.md §13), keeping the posture: raw payload stored first, idempotency by one INSERT, **authoritative refetch of the order on every event**, one compare-and-swap UPDATE. The payload's own status and amounts are never trusted (webhook money is decimal reais, the API's is cents; a test proves the amount check uses the refetch only).

- Envelope: `{event, event_type, site_id, app_id, client_key, external_key, data, partner_merchant}`. The ids inside `data` per event are not documented on the pages read; keep the current tolerant reading (`data.order_id`, `data.id`, top-level fallback) and let 08 pin it from real rows in `webhook_deliveries`.
- Event table, written as a typed map and tested: `order_approved`, `order_paid`, `order_paid_by_pix`, `order_authorized`, `order_pix_created`, `order_billet_created`, `order_pix_expired`, `order_billet_overdue`, `order_refund`, `order_refused_by_risk`, `order_chargeback_in_treatment`, `payment_not_authorized`: every one refetches; the **status mapping** decides, not the event name. `order_pix_expired`, `payment_not_authorized` and `order_billet_overdue` leave a `cancelado`/`pendente` order at `pending` (current mapping, deliberately: `cancelado` must never become `canceled`). Unknown events are stored, acknowledged `200` and ignored.
- `recusado_por_risco` currently maps to `refunded`. With own-form card payments, `autorizado` then `recusado_por_risco` is the normal antifraud outcome, and "refunded" is wrong copy when money may never have moved. Decide with 08 check 7; until then keep the mapping and add the case to `docs/ops/rejected-purchases.md` so the operator checks before revoking.
- Response contract: `200` within Appmax's 5 s (token cache from 01 matters here); refetch failure still `502` with the idempotency key released so the retry (4 attempts at +30 min, +2 h, +4 h) can succeed. Success codes Appmax accepts: 200-208, 226.
- Not changed: no HMAC exists, the source-IP list is unpublished so `APPMAX_WEBHOOK_IPS` stays fail-closed (owner decision before go-live, see spec); `onSubscriptionBecameActive` still sends the magic link on first activation, now with the e-mail from our own form via the refetch.
- Follow-up noted, not built: an event lost beyond the retry window leaves a paid order `pending`. A reconciliation (refetch a stale `pending` order when its confirmation page is polled) is the cheap fix; file it if 08 shows retries failing.

**Blocked by:** 01.

**Status:** ready-for-agent

TDD seam: `handleWebhook` against D1 with the order refetch mocked from the documented shape, one case per mapped event and status (the table above).

- [ ] Each documented event in the table is handled by refetch and produces the expected row transition (card approved, Pix paid, Boleto compensated, refund, chargeback)
- [ ] `order_pix_expired`, `payment_not_authorized` and `order_billet_overdue` leave `pending` rows `pending`, and never overwrite a higher-ranked status
- [ ] A forged payload with decimal amounts or a different status changes nothing beyond what the refetch says
- [ ] Unknown event: logged, `200`, no state change
- [ ] Refetch failure: `502` and the idempotency key is released
- [ ] `recusado_por_risco` behavior documented in the ops doc and the ticket comments (decision pending 08)
- [ ] Typecheck and the full test suite pass
