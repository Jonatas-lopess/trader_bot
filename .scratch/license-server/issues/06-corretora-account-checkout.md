# 06: Collect Corretora account number at checkout and bind it per license

**What to build:** a checkout/provisioning-time field for the Cliente's brokerage account
number, stored per license, so ticket 07 has something to verify against.

Governing docs: spec.md's §Corretora binding (what's decided: verification mechanism, not
this collection UX), PLANNING §11 ("binding to a brokerage account requires *collecting*
that account number, which no current wireframe does" — this ticket is that collection),
CONTEXT.md's "Corretora vinculada" open term (still open — this ticket doesn't resolve how
many accounts a license can bind, only that one can be recorded).

**Blocked by:** —

- [ ] Decide where the field lives in the funnel: at Hosted Checkout (Appmax side, likely
      not extensible for a custom field — verify before assuming), on the intermediate
      confirmation page, or as a customer-area step post-activation. This repo's checkout is
      Appmax-hosted (ADR-0003), so a new field probably can't ride the payment form itself —
      confirm this before designing the UI.
- [ ] Store the account number per `licenses.subscription_id` (same join key as everything
      else in this effort) — new column or sibling table, ops-provisioned or Cliente-entered,
      per whichever collection point ticket resolves.
- [ ] No validation beyond "looks like a broker account identifier" is assumed here — real
      validation (does this account actually exist, is it the Cliente's) is out of scope;
      MT5 account numbers are opaque integers to this system.
- [ ] Tests: the collected value round-trips into what ticket 07's live comparison expects
      (same type/format ticket 07 gets from `AccountInfoInteger(ACCOUNT_LOGIN)`, an integer,
      not a string that needs parsing on the hot verify path).
- [ ] `pnpm test` and `pnpm run typecheck` pass.
