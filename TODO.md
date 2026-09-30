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
| 09 | [Extract the Figma frames' own raw values into Variables](.scratch/marketing-pages/issues/09-figma-variables.md) | 02 | ready-for-agent |

Frontier: **06** (deferred — social proof needs real metrics/testimonials before it can be picked up; see the ticket's launch-blocking inventory), **09** (ready-for-agent, unblocked — 02 is done).

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
| 08 | [No event-ordering tiebreak in the webhook status CAS](.scratch/checkout-webhooks/issues/08-webhook-status-tiebreak.md) | — | wontfix |
| 09 | [`--var PAYMENT_PROVIDER:stripe` on the deploy job must not ship to real production](.scratch/checkout-webhooks/issues/09-revert-payment-provider-before-golive.md) | — | done |

All 9 tickets closed. 08 traced and closed `wontfix` — real but narrow race (transient
`payment_method` staleness, Appmax-only, self-corrects next delivery), and no gateway
timestamp field exists to build a real tiebreak on without trusting the payload or an
unverified Appmax field. 09 closed by making the flag self-dropping (deploy-Environment
variable, not a literal) rather than by scoping a removal — see ticket for the required
one-time manual step (set `PAYMENT_PROVIDER=stripe` on the "dev" Environment before next
push to main).

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

Spec: [.scratch/license-server/spec.md](.scratch/license-server/spec.md) — status
`ready-for-agent`. See ADR-0004 (Accepted — per-license HMAC-SHA256, not RSA/Ed25519; MQL5
has no native asymmetric primitive, confirmed against its own docs).

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Decide what the payload actually carries](.scratch/license-server/issues/01-payload-content-decision.md) | — | deferred (1.0.0) |
| 02 | [Per-license secret/payload schema + verify endpoint](.scratch/license-server/issues/02-schema-and-verify-endpoint.md) | 01 | deferred (1.0.0) |
| 03 | [Provision per-license secret/payload and deliver alongside the binary](.scratch/license-server/issues/03-provisioning-and-delivery.md) | 01, 02 | deferred (1.0.0) |
| 04 | [MQL5 check-in client — verify, fail-closed with tolerance](.scratch/license-server/issues/04-mql5-checkin-client.md) | 02 | deferred (1.0.0) |
| 05 | [Enforce N robôs ativos simultâneos via check-in instance tracking](.scratch/license-server/issues/05-robo-count-entitlement.md) | 01, 02 | wontfix (ADR-0006) |
| 06 | [Collect Corretora account number at checkout and bind it per license](.scratch/license-server/issues/06-corretora-account-checkout.md) | — | superseded by catalog-pivot 07 |
| 07 | [Verify the live-connected Corretora account against the bound one at check-in](.scratch/license-server/issues/07-corretora-live-verification.md) | 02, 04, 06 | deferred (1.0.0) |

Frontier: none until 1.0.0 starts. 01 (payload content) is the first thing to grill then; it blocks the rest. Whole effort is post-launch.

## sentry-integration

No spec.md — small enough to skip straight to tickets.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Wire Sentry into the Worker](.scratch/sentry-integration/issues/01-wire-sentry-into-worker.md) | — | done |
| 02 | [Report the 3 known caught-and-handled failures](.scratch/sentry-integration/issues/02-report-caught-failures.md) | 01 | done |
| 03 | [Report webhook-hardening's security-relevant rejections](.scratch/sentry-integration/issues/03-report-webhook-hardening-rejections.md) | 01 | done |
| 04 | [Source-map upload and a correct `environment` tag](.scratch/sentry-integration/issues/04-sourcemaps-and-environment-tag.md) | 01 | split — see 06, 07 |
| 05 | [Identify and report remaining friction points](.scratch/sentry-integration/issues/05-audit-remaining-friction-points.md) | 01 | done |
| 06 | [Source-map upload on deploy](.scratch/sentry-integration/issues/06-sourcemap-upload.md) | 01 | done |
| 07 | [Correct `environment` tag on captured events](.scratch/sentry-integration/issues/07-environment-tag.md) | 01 | done |
| 08 | [Surface Resend's rejection reason in the send-failure logs](.scratch/sentry-integration/issues/08-resend-rejection-detail.md) | — | done |

All tickets done. 06 closed — token set on the "dev" Environment, CI source-map upload confirmed.

## legal-pages

No spec.md — small enough to skip straight to tickets. The last remaining code piece of
PLANNING §10's 0.1 milestone (see `.scratch/backlog.md`).

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Termos de uso and Política de privacidade pages — structure + placeholder text](.scratch/legal-pages/issues/01-termos-e-privacidade-pages.md) | — | done |

All tickets done. Placeholder bodies still need real legal text before launch (`grep -rn "launchBlocking(" src/content/legal.ts`).

## catalog-pivot

Spec: [.scratch/catalog-pivot/spec.md](.scratch/catalog-pivot/spec.md) — status `done` (11 stays deferred to 1.0.0; Appmax sandbox checks are pre-go-live gates, PLANNING §13).
Source of truth: [ADR-0006](docs/adr/0006-catalog-pivot.md). Docs pass (CONTEXT, PLANNING, ADR) done.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Catalog content file and server-side price lookup](.scratch/catalog-pivot/issues/01-catalog-content-file.md) | — | done |
| 02 | [Migration 0008: purchases, licenses, download_tokens](.scratch/catalog-pivot/issues/02-purchases-migration.md) | 01 | done |
| 03 | [Checkout by robot_id + offer](.scratch/catalog-pivot/issues/03-checkout-by-robot-and-offer.md) | 01, 02 | done |
| 04 | [Webhook amount check and the rejected state](.scratch/catalog-pivot/issues/04-webhook-amount-check.md) | 02, 03 | done |
| 05 | [Derive Licença expiry from purchase status](.scratch/catalog-pivot/issues/05-license-expiry-derivation.md) | 02 | done |
| 06 | [/catalog page replaces /planos](.scratch/catalog-pivot/issues/06-catalog-page.md) | 01 | done |
| 07 | [Customer area: Licença states and Corretora account form](.scratch/catalog-pivot/issues/07-customer-area-license-states.md) | 02, 05 | done |
| 08 | [Per-Licença delivery](.scratch/catalog-pivot/issues/08-per-license-delivery.md) | 02, 07 | done |
| 09 | [Termos de uso: 7-day withdrawal clause](.scratch/catalog-pivot/issues/09-termos-withdrawal-clause.md) | — | done |
| 10 | [Copy and docs sweep for leftover Plano language](.scratch/catalog-pivot/issues/10-copy-and-docs-sweep.md) | 06 | done |
| 11 | [Research: automated compile/issuance and annual auto-renew](.scratch/catalog-pivot/issues/11-research-automation.md) | — | deferred (1.0.0) |
| 12 | [End-to-end verification](.scratch/catalog-pivot/issues/12-end-to-end-verification.md) | 03, 04, 07, 08 | done |
| 13 | [Persist fiscal data on the purchase for NFS-e](.scratch/catalog-pivot/issues/13-fiscal-data-for-nfse.md) | 02, 04 | done |
| 14 | [Identity per email — one customer, many purchases](.scratch/catalog-pivot/issues/14-identity-per-email.md) | — | done |

Frontier: none (all done; 11 deferred). Supersedes `marketing-pages` 07/08 and `license-server` 05 (wontfix) / 06 (superseded).

## Untracked

[.scratch/backlog.md](.scratch/backlog.md) — remaining 0.1 work, the external prerequisites, and the "Open before go-live (catalog-pivot)" list: Appmax sandbox checks, owner decisions, launch-blocking copy.
