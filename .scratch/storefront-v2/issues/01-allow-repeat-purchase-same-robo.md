# 01: Allow buying the same Robô again

**What to build:** Remove the one-active-Licença-per-Cliente-per-Robô rule (ADR-0008). Delete `hasActivePurchase` and the 409 branch in `modules/billing/checkout.ts` (and the `customerId` plumbing in `pages/checkout.ts` if nothing else uses it), delete `modules/licensing/duplicate-license.ts` with its test and its call in `webhook.ts`. Then audit for any other assumption of one Licença per (Cliente, Robô): `licenses` is keyed by `purchase_id` so rows are fine, but check `/conta` rendering, `account-page.ts`, `corretora-account.ts`, `activate.ts`, `dispatch.ts`, `download-tokens.ts`, `withdrawal.ts` and `license-expiry.ts`.

- `/conta`: two cards for the same Robô must be tellable apart. Show the Corretora account (when set) and the purchase date on each card; copy in `src/content/conta.ts`.
- Update the `checkout.test.ts`, `webhook.test.ts` and `catalog-e2e.test.ts` cases that asserted the block or the alert into cases asserting a second purchase succeeds and yields a second Licença and a second download link.
- Update the comments that cite the rule (`webhook.ts`, `checkout.ts`) and README if it mentions it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A logged-in Cliente holding an `active` purchase can start a checkout for the same Robô (no 409)
- [ ] The webhook no longer reports duplicates; the module and its tests are gone
- [ ] A second purchase by the same email creates a second Licença under the same Cliente; both show in `/conta`, distinguishable
- [ ] Corretora account entry, download and cancel work per Licença when two share a Robô
- [ ] Typecheck and the full test suite pass
