# 02: Checkout session creation

**What to build:** a Cliente who clicks "Assinar Starter/Pro/Enterprise" on `/planos` is
taken straight to Appmax's hosted payment page, with a provisional record already waiting
in D1 to be found by the webhook once payment confirms.

Governing docs: spec.md's "Checkout session creation" and "Provisional record" (under
Implementation Decisions), User Stories 1-2, PLANNING.md §6/§7.

**Blocked by:** 01 (needs the D1 binding, `plans` table, and Workers test runtime).

**Status:** done

- [ ] `/checkout?plan=<id>` resolves `plan` against the existing `PlanId` union
      (`starter | pro | enterprise`) in `src/content/plans.ts`; an unknown/missing `plan`
      is rejected rather than silently defaulting.
- [ ] A provisional D1 row is written (status `pending`) before the redirect fires, keyed
      to this checkout attempt, carrying enough (which Plano, which attempt) for the
      webhook to find it later without the Cliente having authenticated (User Story 14).
- [ ] An Appmax hosted-checkout session is created for that Plano's monthly price (annual
      is out of scope per spec.md's Out of Scope section — no annual price exists in
      `src/content/plans.ts` yet).
- [ ] The Cliente is redirected to Appmax's hosted checkout page.
- [ ] The exact request/response contract (how the post-payment redirect identifies which
      checkout attempt completed) is confirmed against Appmax's sandbox during this
      ticket, per spec.md's Further Notes — this is the one open integration detail.
- [ ] Only the outbound `fetch` to Appmax's API is mocked in tests; the D1 write runs
      against the real binding from ticket 01, per spec.md's Testing Decisions.
- [ ] `npm test` and `npm run typecheck` pass.

## Comments

No Appmax sandbox credentials were available during implementation (checked with the
business owner — see PLANNING.md §13's new bullet). The "exact request/response contract"
checkbox above is resolved as: correlation is owned by us, not Appmax — we mint our own
`reference` before calling Appmax and pass it via `return_url`, so the post-payment
redirect always carries it regardless of what Appmax's response shape turns out to be.
The rest of the contract (auth flow, endpoint paths, field names) is the
best-documented approximation from Appmax's public docs, isolated behind
`src/modules/billing/appmax-client.ts`'s single seam and clearly marked unverified there.
Verify against a real sandbox call before go-live.
