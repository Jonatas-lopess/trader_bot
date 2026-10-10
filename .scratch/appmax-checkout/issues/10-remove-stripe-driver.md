# 10: Remove the Stripe test driver

**What to build:** Once Appmax is verified in the sandbox (08), delete the test-only Stripe driver and the seam it forced (ADR-0005 says the intent is Appmax-only): `stripe-client.ts`, `stripe-webhook.ts`, their tests, `/billing/webhook/stripe`, `STRIPE_*` env vars and rate limiter binding, the `PAYMENT_PROVIDER` variable and its deploy-step plumbing in `ci.yml`, and `factory.ts`. Decide then whether `IPaymentProvider` is kept as a thin type or removed (with one provider and `checkout: 'own-form'` only, the `redirect` branch from 02 has no user). Migration for `purchases.provider` and its CHECK is decided with it (the column may stay for history). Mark ADR-0005 as superseded and update PLANNING.md §6.

**Blocked by:** 08.

**Status:** deferred

- [ ] Stripe code, tests, env vars, bindings and CI plumbing removed
- [ ] Seam simplified or removed; PLANNING.md §6 and ADR-0005 updated
- [ ] Typecheck and the full test suite pass
