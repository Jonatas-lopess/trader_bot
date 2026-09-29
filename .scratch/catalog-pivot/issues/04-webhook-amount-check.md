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

