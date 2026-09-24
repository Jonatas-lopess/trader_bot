# TODO

Index of `.scratch/`. One directory per effort, one file per ticket.
Conventions in `docs/agents/issue-tracker.md`; status strings in `docs/agents/triage-labels.md`.

## marketing-pages

Spec: [.scratch/marketing-pages/spec.md](.scratch/marketing-pages/spec.md)

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Astro + Cloudflare Workers scaffold](.scratch/marketing-pages/issues/01-astro-cloudflare-scaffold.md) | — | done |
| 02 | [Design tokens from the Figma frames](.scratch/marketing-pages/issues/02-design-tokens.md) | 01 | done |
| 03 | [Site shell — layout, header, footer, metadata](.scratch/marketing-pages/issues/03-site-shell.md) | 01, 02 | done |
| 04 | [Landing — hero section](.scratch/marketing-pages/issues/04-landing-hero.md) | 03 | done |
| 05 | [Landing — video section and "4 passos"](.scratch/marketing-pages/issues/05-landing-video-and-steps.md) | 03 | done |
| 06 | [Landing — social proof](.scratch/marketing-pages/issues/06-landing-social-proof.md) | 03 | deferred |
| 07 | [Plans page](.scratch/marketing-pages/issues/07-plans-page.md) | 03 | done |
| 08 | [Landing — plan teaser and FAQ](.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md) | 03, 07 | done |

Frontier: **06** (deferred — social proof needs real metrics/testimonials before it can be picked up; see the ticket's launch-blocking inventory).

## checkout-webhooks

Spec: [.scratch/checkout-webhooks/spec.md](.scratch/checkout-webhooks/spec.md) — status `done`.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Test harness + D1 schema for billing](.scratch/checkout-webhooks/issues/01-test-harness-d1-schema.md) | — | done |
| 02 | [Checkout session creation](.scratch/checkout-webhooks/issues/02-checkout-session-creation.md) | 01 | done |
| 03 | [Status endpoint](.scratch/checkout-webhooks/issues/03-status-endpoint.md) | 01, 02 | done |
| 04 | [Webhook core — idempotent, compare-and-swap state sync](.scratch/checkout-webhooks/issues/04-webhook-core.md) | 01, 02 | done |
| 05 | [Intermediate confirmation page](.scratch/checkout-webhooks/issues/05-intermediate-confirmation-page.md) | 02, 03 | done |
| 06 | [Webhook hardening — IP filter, payload validation, rate limit](.scratch/checkout-webhooks/issues/06-webhook-hardening.md) | 04 | done |
| 07 | [End-to-end verification — happy path, boleto branch, concurrency](.scratch/checkout-webhooks/issues/07-end-to-end-verification.md) | 04, 05, 06 | done |

All 7 tickets done.

## customer-area

Spec: [.scratch/customer-area/spec.md](.scratch/customer-area/spec.md) — status `done`.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Customer identity — schema + provisioning from payment confirmation](.scratch/customer-area/issues/01-customer-identity-provisioning.md) | — | done |
| 02 | [Magic-link login](.scratch/customer-area/issues/02-magic-link-login.md) | 01 | done |
| 03 | [Customer area — license status](.scratch/customer-area/issues/03-license-status-page.md) | 02, 01 | done |
| 04 | [Cancel subscription](.scratch/customer-area/issues/04-cancel-subscription.md) | 03, 01 | done |
| 05 | [End-to-end verification — login-to-cancel happy path](.scratch/customer-area/issues/05-end-to-end-verification.md) | 02, 03, 04 | done |
| 06 | [Log magic-link send failures](.scratch/customer-area/issues/06-log-magic-link-send-failure.md) | 02 | done |
| 07 | [Auto-send magic-link on first activation](.scratch/customer-area/issues/07-auto-send-magic-link-on-activation.md) | 01, 02, 06 | done |
| 08 | [Recover a subscription stuck by a null email on activation](.scratch/customer-area/issues/08-recover-null-email-activation.md) | 01, 07 | done |

All 8 tickets done.

## robot-delivery

No spec.md — small enough to skip straight to tickets.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Download-token D1 schema + R2 binding scaffold](.scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md) | — | done |
| 02 | [Mint, dispatch, and redeem the download link](.scratch/robot-delivery/issues/02-mint-dispatch-redeem.md) | 01 | done |
| 03 | [End-to-end verification — mint to download](.scratch/robot-delivery/issues/03-end-to-end-verification.md) | 02 | done |

All 3 tickets done.

## license-server

Spec: [.scratch/license-server/spec.md](.scratch/license-server/spec.md) — status `needs-triage`.
See ADR-0004 (per-license HMAC-SHA256, not RSA/Ed25519 — MQL5 has no native asymmetric
primitive).

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Decide what the payload actually carries](.scratch/license-server/issues/01-payload-content-decision.md) | — | needs-triage |
| 02 | [Per-license secret/payload schema + verify endpoint](.scratch/license-server/issues/02-schema-and-verify-endpoint.md) | 01 | needs-triage |
| 03 | [Provision per-license secret/payload and deliver alongside the binary](.scratch/license-server/issues/03-provisioning-and-delivery.md) | 01, 02 | needs-triage |
| 04 | [MQL5 check-in client — verify, fail-closed with tolerance](.scratch/license-server/issues/04-mql5-checkin-client.md) | 02 | needs-triage |
| 05 | [Enforce N robôs ativos simultâneos via check-in instance tracking](.scratch/license-server/issues/05-robo-count-entitlement.md) | 01, 02 | needs-triage |

Frontier: **01** — the payload-content decision blocks everything else in this effort; resolve it first.

## Untracked

[.scratch/backlog.md](.scratch/backlog.md) — remaining 0.1 work and the external prerequisites.
