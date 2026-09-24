# 08: Recover a subscription stuck by a null email on activation

**What to build:** an ops path to unblock the edge case ticket 07's auto-send introduced a
sharper failure mode for — Appmax's authoritative re-fetch reports no `email` field on
first activation. `onSubscriptionBecameActive` already logged and bailed before this ticket
(`identity-provisioning.md`'s own scope), but that was always a secondary, opt-in path
(Cliente still had to type an email at `/login` to hit it). Ticket 07 made auto-send the
*primary* path, so this became: Cliente pays successfully, subscription is `active`, but no
`customers` row exists at all — and with none, `/login`'s email lookup can never match
either. Zero self-service recourse, ops-log-only visibility.

Governing docs: `07-auto-send-magic-link-on-activation.md` (what raised this edge case's
stakes); `01-customer-identity-provisioning.md` (the existing null-email log this builds on).

**Blocked by:** 01, 07.

**Status:** done

- [x] `scripts/provision-customer.ts` — ops CLI, same `getPlatformProxy` shape as
      `send-download-link.ts`: given `--subscription-id` (our own `subscriptions.id`) and an
      `--email` the operator obtained out-of-band (Appmax's dashboard, a support ticket),
      creates the missing `customers` row and sends the magic-link email in one step.
      Validates the subscription id exists first (no FK enforced on `subscription_id`, this
      codebase's convention — an ops typo must not silently create an orphan row). Already
      the header comment documents the D1 query to find candidates:
      `subscriptions` rows `active` with no matching `customers` row.
- [x] `identity/magic-link.ts`'s `issueMagicLink` returns `{ ok }` instead of `void` — the
      CLI needs to report a Resend failure directly to whoever's running it, rather than
      relying only on the function's own internal log (which `requestMagicLink` and the
      webhook's fire-and-forget callers still rely on, unchanged).
- [x] Once the `customers` row exists (even if the one-off magic-link send from this script
      itself fails), `/login`'s self-service flow works for that Cliente going forward —
      the script's own output says so rather than implying a retry of the script is needed.
- [x] `npm run provision-customer -- --subscription-id=<id> --email=<email>` added to
      `package.json`.
- [x] `npm test` and `npm run typecheck` pass.

## Comments

No dedicated test file — matches `send-download-link.ts`, this repo's only other CLI script,
which also has none; the logic it calls (`provisionCustomer`, `issueMagicLink`) is already
covered where those live (`customers.ts`/`magic-link.ts` test suites, plus `webhook.test.ts`
for the `created`-gating behavior).

Deliberately does not attempt to auto-discover the email anywhere in our own system —
`webhook_deliveries` stores the raw webhook payload, not the authoritative re-fetch response
that actually carries (or omits) the email field, so there's nothing to recover from
in-repo. An operator has to go to Appmax's own dashboard/support to find the real email; this
script is only the "apply it" half.
