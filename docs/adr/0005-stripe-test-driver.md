# A test-only Stripe driver alongside Appmax, behind a payment-provider seam

Status: Accepted, scoped as a stopgap. Does **not** supersede
[ADR-0003](0003-appmax-como-gateway.md) — Appmax remains the committed production gateway.
This ADR only reopens the one line in PLANNING.md §6 that ruled out a provider interface,
and only far enough to let Stripe stand in during local/manual testing.

## Context

PLANNING.md §6 previously stated: "No payment-provider interface. Appmax is the committed
gateway (ADR-0003, supersedes ADR-0001) with no swap planned. An `IPaymentProvider`
abstraction would be built for a second implementation that doesn't exist — speculative
generality §5 already rules out." That was correct when written — there was no second
implementation.

There is now a concrete, immediate reason: Appmax's own account creation is currently
blocked (signup did not go through), so there is no way to exercise the checkout flow
end-to-end against Appmax at all — sandboxed or otherwise — until that's resolved. Stripe
test mode is usable today with no onboarding gate.

## Decision

A minimal `IPaymentProvider` interface (`src/modules/billing/payment-provider.ts`), scoped to
exactly the two operations that needed a second implementation — `createCheckoutSession` and
`cancelSubscription` (plus `fetchAuthoritativeStatus`, needed by both) — not a general
gateway abstraction. `factory.ts` selects the implementation off `PAYMENT_PROVIDER`, defaulting
to Appmax for anything but an explicit `"stripe"` — same fail-closed-to-the-committed-gateway
posture as `APPMAX_WEBHOOK_IPS` failing closed rather than open.

**Webhook handling stays out of the interface, on purpose.** Appmax and Stripe's webhook
trust models are structurally different — Appmax signs nothing and requires the
authoritative-refetch-on-every-event posture PLANNING.md §6 describes; Stripe signs every
delivery (`Stripe-Signature`, verified in `stripe-webhook.ts` per Stripe's own documented
scheme) and could in principle be trusted further than that. Forcing both through one
interface would mean either discarding Stripe's real signature verification to match
Appmax's weaker story, or inventing a signature scheme for Appmax that doesn't exist. Each
gateway keeps its own webhook module and route — `webhook.ts` + `webhook-hardening.ts` +
`/billing/webhook` for Appmax (unchanged), `stripe-webhook.ts` + `/billing/webhook/stripe`
for Stripe.

**Scope: test mode only, not a launch decision.** ADR-0003's reasons for rejecting Stripe as
the *production* gateway — Brazilian card acceptance excludes Elo, Hipercard and local debit,
and the "get rich quick" prohibited-business clause maps more directly onto trading-automation
copy than Appmax's narrower policy — are unchanged and not re-litigated here. This driver is
for exercising the checkout code path locally while Appmax account creation is blocked, not
for taking real Brazilian customer payments. `PAYMENT_PROVIDER` is never set to `stripe` in a
deployed environment; nothing in this change makes it launch-eligible.

**Schema.** `subscriptions.provider` (migration `0007_payment_provider.sql`) records which
gateway a row belongs to, defaulting to `appmax`. The existing `appmax_order_id`/
`appmax_subscription_id` columns are reused for whichever provider created the row rather than
renamed — they're indexed and referenced throughout the existing checkout-webhooks test suite,
and `provider` is what disambiguates which gateway's ids they hold now.

## Consequences

- Checkout-session creation and cancellation are swappable; webhook ingestion is not, and
  isn't meant to be — see above.
- No Stripe Billing Portal, no Stripe-hosted plan catalog: `src/content/plans.ts` stays the
  single source of plan data (PLANNING.md §6, "A customer self-service portal ... is ours"
  applies to both gateways equally).
- Boleto and Pix are not implemented for the Stripe driver — it's card-only, and only
  meaningful with a Stripe account that isn't onboarded for BR local methods anyway.
- This ADR should be revisited (and the seam either removed or formally promoted) once Appmax
  account creation succeeds — the intent is to go back to Appmax-only, not to carry two
  gateways indefinitely.

## Considered and rejected

**Wait on Appmax rather than build a second driver.** Blocks all checkout-flow testing
indefinitely on an external, unscheduled onboarding process outside our control. Rejected —
the cost of a narrowly-scoped seam is small next to being unable to exercise the flow at all.

**A full gateway abstraction covering webhooks too.** Rejected per "webhook handling stays out
of the interface" above — the two providers' trust models don't share a real contract, and
faking one would weaken Stripe's own signature verification for no benefit.
