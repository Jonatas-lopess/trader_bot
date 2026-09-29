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

