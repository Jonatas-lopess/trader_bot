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

Spec: [.scratch/checkout-webhooks/spec.md](.scratch/checkout-webhooks/spec.md) — status `ready-for-agent`.

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | [Test harness + D1 schema for billing](.scratch/checkout-webhooks/issues/01-test-harness-d1-schema.md) | — | done |
| 02 | [Checkout session creation](.scratch/checkout-webhooks/issues/02-checkout-session-creation.md) | 01 | done |
| 03 | [Status endpoint](.scratch/checkout-webhooks/issues/03-status-endpoint.md) | 01, 02 | done |
| 04 | [Webhook core — idempotent, compare-and-swap state sync](.scratch/checkout-webhooks/issues/04-webhook-core.md) | 01, 02 | ready-for-agent |
| 05 | [Intermediate confirmation page](.scratch/checkout-webhooks/issues/05-intermediate-confirmation-page.md) | 02, 03 | ready-for-agent |
| 06 | [Webhook hardening — IP filter, payload validation, rate limit](.scratch/checkout-webhooks/issues/06-webhook-hardening.md) | 04 | ready-for-agent |
| 07 | [End-to-end verification — happy path, boleto branch, concurrency](.scratch/checkout-webhooks/issues/07-end-to-end-verification.md) | 04, 05, 06 | ready-for-agent |

Frontier: **04** (01-03 done; 05 also unblocked but lower-numbered 04 wins).

## Untracked

[.scratch/backlog.md](.scratch/backlog.md) — remaining 0.1 work and the external prerequisites.
