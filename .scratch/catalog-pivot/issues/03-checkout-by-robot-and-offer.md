# 03: Checkout by robot_id + offer

**Blocked by:** 01, 02

**Status:** ready-for-agent

**What to build:** checkout session creation accepts only `robot_id` + `offer`; price from `lookupOffer`; `amount_cents` stored on the new purchase row. Rejects unknown robot/offer with no session created. One Robô per request. Blocks a second active Licença for the same Cliente + Robô (identify the Cliente by the authenticated session if present; guest checkout keeps the check for after provisioning, see Comments). Payment methods per Oferta: Compra/Anual card+Boleto+Pix, Mensal card only, enforced in both drivers behind `IPaymentProvider` (ADR-0005). Mensal maps to recurring, Compra/Anual to single charge.

Governing docs: ADR-0006, PLANNING.md §6, `.scratch/checkout-webhooks/issues/02-checkout-session-creation.md`.

- [ ] A client-supplied price/amount field is ignored (test posts a tampered body)
- [ ] Mensal never offers Pix/Boleto; Compra/Anual offer all three
- [ ] `amount_cents` persisted equals the catalog price at creation time
- [ ] Both drivers covered; `pnpm test` and `pnpm run typecheck` pass

## Comments

Duplicate-Licença guard for guests: the Cliente is only identified after payment (PLANNING §7), so the guard may have to live at provisioning (flag the purchase for operator review instead of failing after money moved). Decide when building.


## Appmax findings (2026-09-29, docs.appmax.com.br)

Driver (`appmax-client.ts`) endpoint shapes are unverified guesses; the docs say:

- Base paths carry `/v1` (`/v1/orders/{id}`, `/v1/subscriptions`, ...). Sandbox `https://api.sandboxappmax.com.br`, production `https://api.appmax.com.br`; the driver hardcodes sandbox, add an env switch.
- Auth is OAuth2 client credentials, token valid 1h (cache it). Order and subscription endpoints require **merchant** credentials, not app credentials: confirm which pair `APPMAX_CLIENT_ID`/`_SECRET` are.
- Money is integer cents. Order value: send `unit_value` per product (= `lookupOffer` price), `shipping_value` 0, `discount_value` 0; Appmax does not compute interest. `freight_value`/`discount` on the subscription endpoint are documented as decimal: verify units in sandbox before sending non-zero values.
- Compra/Anual: one order. **Mensal is two steps**: create the order, wait for `aprovado`/`integrado` (not `autorizado`), then `POST /v1/subscriptions` with `order_id` (integer), `interval: "month"`, `interval_count: 1`. The current single `POST /payment-links` flow does not fit; find out whether payment links can create subscriptions directly.
- The docs allow card **or Pix** as the base order of a subscription, contradicting PLANNING §6 ("Pix not available for recurring"). Keep Mensal card-only; verify with a sandbox test or Appmax before changing.
- Sandbox: Pix/Boleto auto-approve ~5s after creation; document `40827365000109` simulates pending.
- Duplicate-Licença guard counts only `active` purchases; a `pending` row from an abandoned or declined attempt must never block a new checkout.
