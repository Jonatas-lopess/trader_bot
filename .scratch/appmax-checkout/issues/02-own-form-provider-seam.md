# 02: Seam: a provider can use our own form instead of a redirect

**What to build:** `IPaymentProvider.createCheckoutSession` returns a `checkoutUrl` to redirect to, which fits Stripe and not Appmax's own-form flow (ADR-0007). Change the seam so `GET /checkout?robot=&offer=` serves both, keeping Stripe's behavior byte for byte.

Design (adjust if the code asks for it, but keep these properties):

- `IPaymentProvider` becomes `Common & ({checkout: 'redirect'; createCheckoutSession} | {checkout: 'own-form'})`. `Common` keeps `id`, `fetchAuthoritativeStatus`, `cancelSubscription`. The Appmax provider is `own-form` and has no `createCheckoutSession`; Stripe is `redirect`. Webhooks stay out (ADR-0005).
- `checkout.ts`: `createCheckoutSession` becomes `resolveCheckout(env, params)` returning `{kind:'redirect', redirectUrl}`, `{kind:'form', robotId, offer, amountCents, methods, reference}` or `{kind:'unavailable', reason:'offer_not_supported'}`, plus the existing 400/409/502 errors. Validation, catalog lookup and the one-active-Licença check are shared. For `own-form` it writes **no** row (the row is written by the pay endpoint, 05); `reference` is a fresh UUID minted per render. For `redirect` the row insert stays as today.
- Mensal on an `own-form` provider returns `unavailable` until 09 exists; Stripe still sells Mensal.
- `src/pages/checkout.ts` is replaced by `src/pages/checkout.astro` (same URL; the two cannot coexist). The page: `redirect` → `Astro.redirect(url, 302)`; errors → the same status codes and plain messages as today; `form` and `unavailable` render a minimal placeholder here (04 builds the real UI), so this ticket is verifiable on its own.
- Delete `createHostedCheckoutSession` and the `/payment-links` test mocks from `appmax-client.ts`/tests; rewrite `checkout.test.ts`, `e2e.test.ts` and `catalog-e2e.test.ts` to the new flow (Appmax tests that need a purchase row set it up directly until 05 exists).
- Fix the comments that still say hosted: `payment-provider.ts` (`cancelUrl` note), `webhook.ts` ("Appmax's hosted page is what collects the email"), `catalog-page.ts` ("Checkout is hosted by Appmax"; another agent edits that file, so make this one-line comment edit last, after pulling its changes).

**Blocked by:** 01.

**Status:** done

TDD seam: `resolveCheckout` against real D1 with the Stripe path mocked at `fetch` as today; a fake own-form provider is not needed, `PAYMENT_PROVIDER` unset selects Appmax.

- [x] `PAYMENT_PROVIDER=stripe`: `/checkout` still creates the session, inserts the pending row and redirects, exactly as before
- [x] Appmax: `/checkout` for Compra and Anual returns the form data (methods from `paymentMethodsFor`, price from the catalog, fresh `reference`) and inserts nothing
- [x] Appmax Mensal returns `unavailable`; unknown robot or offer is still 400, an already active Licença for the session's Cliente still 409
- [x] A tampered price-like query param is ignored (ADR-0006), covered by a test
- [x] `createHostedCheckoutSession` and its mocks are gone; `/payment-links` appears nowhere in `src/`
- [x] Comments that call the checkout hosted are corrected
- [x] Typecheck and the full test suite pass

## Comments

- The one-active-Licença 409 no longer exists: ADR-0008 allows buying the same Robô again, so `resolveCheckout` keeps today's behavior (no 409) and a test covers the repeat purchase getting the form.
- Mensal: the D1 catalog cannot sell it (ADR-0008 standby), so on Stripe it stays a 400 as before. On Appmax a published Robô with `offer=monthly` answers `unavailable` (checked before the catalog lookup); an unknown Robô is still 400.
- The `/checkout` route is now an `.astro` page, which a unit test cannot call; the "price-like param ignored" check moved to `readCheckoutQuery`, the one place that reads the URL.
- `CheckoutForm` also carries `robotName` for the order summary (04).
