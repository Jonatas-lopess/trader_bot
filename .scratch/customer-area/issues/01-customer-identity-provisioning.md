# 01: Customer identity — schema + provisioning from payment confirmation

**What to build:** a `customers` table, populated with the buyer's email at the moment a
subscription is confirmed `active`, reusing the webhook's existing Appmax-authoritative
status re-fetch rather than trusting the webhook payload.

Governing docs: spec.md's "Solution" and "Implementation Decisions" (single subscription
per customer, unverified Appmax email field); PLANNING.md §6 (webhook trust model), §7
(account provisioned from payment, not before). User Stories 1.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `customers` table added (email, linked 1:1 to a `subscriptions` row), under
      `modules/identity` per PLANNING §4.
- [ ] The point in the webhook flow where a subscription first becomes `active`
      (`checkout-webhooks` ticket 04's documented hook) is extended to also read the
      buyer's email from the same authoritative Appmax status re-fetch already being made —
      no new outbound call added — and write the `customers` row.
- [ ] Re-applying an already-`active` webhook event (a reapplied event, per
      `checkout-webhooks` ticket 07's comments) does not create a duplicate `customers` row
      for the same subscription.
- [ ] A subscription with no matching Appmax email field (confirming the unverified-field
      risk in spec.md) fails visibly (logged/observable) rather than silently leaving
      `customers` unpopulated with no trace.
- [ ] Tests, against the real D1 binding with only Appmax's `fetch` mocked: a webhook event
      that transitions a subscription to `active` produces a matching `customers` row; a
      reapplied `active` event does not duplicate it.
- [ ] `npm test` and `npm run typecheck` pass.
