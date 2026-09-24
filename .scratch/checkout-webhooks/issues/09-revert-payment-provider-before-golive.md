# 09: `PAYMENT_PROVIDER: "stripe"` in wrangler.jsonc must not ship to real production

**What to build:** before the go-live deploy (custom-domain, PLANNING.md §12), remove or
override the `vars.PAYMENT_PROVIDER: "stripe"` entry in `wrangler.jsonc` so production
resolves to Appmax — the committed production gateway (ADR-0003) — via
`factory.ts`'s fail-closed default, not the Stripe test driver (ADR-0005).

Governing docs: docs/adr/0003 (Appmax as committed production gateway); docs/adr/0005
(Stripe test driver); factory.ts's header comment.

**Blocked by:** none — pending action, not yet scoped.

**Status:** needs-triage

## Problem

`wrangler.jsonc` now hardcodes `"vars": { "PAYMENT_PROVIDER": "stripe" }` (added to
unblock local/workers.dev test-phase checkout flows while Appmax onboarding is
blocked). `factory.ts`'s `selectProvider` reads this same env var at runtime with no
environment-specific override — `wrangler.jsonc` is also the config CI's deploy job
uses (ci.yml's `deploy` job, currently the workers.dev test route only).

If the go-live deploy reuses this same `wrangler.jsonc` without change, real customer
checkout traffic on the production domain would route to Stripe's test-mode driver
(fake products created ad-hoc per checkout session, stripe-client.ts) instead of
Appmax, silently — no error, just the wrong gateway.

## Open questions

- Does go-live introduce a separate `wrangler.jsonc` / environment-scoped config
  (Wrangler's `env` blocks) so test and prod stop sharing this file, or does this stay
  one file that must be hand-edited before the go-live deploy?
- Should `PAYMENT_PROVIDER` instead be removed entirely once Appmax onboarding
  unblocks, relying on `factory.ts`'s fail-closed-to-Appmax default, rather than ever
  setting it explicitly again?

## Comments

Logged while wiring up the Stripe test driver locally — flagged as a go-live blocker,
not an immediate bug (current deploy target is workers.dev test route only, per
ci.yml, gated behind PLANNING.md §12's custom-domain prerequisite same as go-live
itself).
