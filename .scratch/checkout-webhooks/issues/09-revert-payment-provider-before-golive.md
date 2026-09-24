# 09: `--var PAYMENT_PROVIDER:stripe` on the deploy job must not ship to real production

**What to build:** before the go-live deploy (custom-domain, PLANNING.md §12), remove
the `--var PAYMENT_PROVIDER:stripe` flag from ci.yml's `deploy` step so production
resolves to Appmax — the committed production gateway (ADR-0003) — via
`factory.ts`'s fail-closed default, not the Stripe test driver (ADR-0005).

Governing docs: docs/adr/0003 (Appmax as committed production gateway); docs/adr/0005
(Stripe test driver); factory.ts's header comment.

**Blocked by:** none — pending action, not yet scoped.

**Status:** needs-triage

## Problem

The workers.dev test-phase deploy job (ci.yml) passes `--var PAYMENT_PROVIDER:stripe`
on its `wrangler deploy` command to pick the Stripe test driver.

This was first tried as a `wrangler.jsonc` `vars` entry instead, but that config file is
shared with the test/build job — vitest-pool-workers reads it too — and `checkout.test.ts`
/ `e2e.test.ts` mock only Appmax and assert on Appmax's fail-closed default, so baking
the var into `wrangler.jsonc` broke CI (3 test failures, PR #5's first two runs). Moved
the var to the deploy step's `--var` flag instead, scoped to that one job, config file
left untouched.

That fix contains the immediate problem, but the underlying risk carries forward: if the
go-live deploy job reuses this same `--var` flag (e.g. by copying ci.yml's deploy step
wholesale for the production workflow) without dropping it, real customer checkout
traffic on the production domain would route to Stripe's test-mode driver (fake
products created ad-hoc per checkout session, stripe-client.ts) instead of Appmax,
silently — no error, just the wrong gateway.

## Open questions

- Does go-live introduce a wholly separate deploy job/workflow, or does it extend this
  same `deploy` job (e.g. by branching on target route)? Whichever it is, that's where
  to make sure the flag doesn't carry over.
- Should `PAYMENT_PROVIDER` instead be removed entirely once Appmax onboarding
  unblocks, so the test-phase deploy also relies on `factory.ts`'s fail-closed default,
  rather than any deploy target ever setting it explicitly again?

## Comments

Logged while wiring up the Stripe test driver locally — flagged as a go-live blocker,
not an immediate bug (current deploy target is workers.dev test route only, per
ci.yml, gated behind PLANNING.md §12's custom-domain prerequisite same as go-live
itself).

Updated after the `wrangler.jsonc`-vars approach broke CI tests and was replaced with
the deploy-step `--var` flag (see Problem section) — ticket's concern still applies,
just relocated to a different file.
