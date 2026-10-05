# Robô Trader

Marketing site and customer area for the Robô Trader, an MT5 (MetaTrader 5) Expert
Advisor. Sells a catalog of robots, delivers them, and lets customers manage their license
— all in one codebase.

The business sells the right to run the robot against a customer's own brokerage account
(Corretora). It never holds or moves customer funds.

## What it does (0.1 scope)

- Landing and `/catalog` pages (pt-BR only)
- Hosted checkout with card, Boleto and Pix (Appmax)
- Magic-link authentication (no passwords)
- Customer area: license status, key/expiry, Corretora account, cancel Mensal subscription
- Robot delivery via a signed, expiring download link (email), per license
- Legal pages (placeholder text, pending real copy)

Not in 0.1: in-app binary download, automated compile/license issuance, entitlement enforcement,
annual auto-renew, automated NFS-e emission. See `PLANNING.md` §1.

## Stack

Astro + `@astrojs/cloudflare`, deployed to Cloudflare Workers (Static Assets). D1 for
application state, R2 for the robot binary, Resend for transactional email, Tailwind v4
for styling. Tests with Vitest (webhook/token/session logic) and Playwright (one
checkout-to-customer-area happy path).

## Docs

- `PLANNING.md` — technical contract: scope, stack, payments, auth, licensing, compliance.
  Binding until changed there.
- `CONTEXT.md` — domain vocabulary (Catálogo, Oferta, Compra, Assinatura, Cliente, Robô,
  Licença, Chave, Corretora, Boleto, Pix).
- `docs/adr/` — architecture decisions.
- `TODO.md` — index of tracked work in `.scratch/`.

## Status

Built and done, per `TODO.md`:

- **marketing-pages** — Astro + Cloudflare Workers scaffold, Tailwind v4 design tokens,
  site shell, hero, video/how-it-works, FAQ (the plans page and plan teaser were replaced by
  `catalog-pivot`). Ticket 06 (social proof) is deferred: the frame's metrics and testimonials are fabricated placeholders
  (PLANNING.md §2) with no real figures to ship yet.
- **checkout-webhooks** — hosted checkout, webhook (idempotent, compare-and-swap state
  sync, IP filter, payload validation, rate limit), intermediate confirmation page
  including the boleto branch.
- **customer-area** — magic-link login, license status, cancel subscription, magic-link
  send-failure logging, auto-send on activation.
- **robot-delivery** — signed, expiring download link (D1 token + R2 binding), email
  dispatch.
- **sentry-integration** — error reporting wired into the Worker, source maps uploaded on
  deploy.
- **legal-pages** — Termos de uso / Política de privacidade (placeholder text); also
  shown as a modal in the customer area.
- **figma-restyle** — Figma-sourced colors, shape tokens and self-hosted fonts; `/conta`
  ("Meus produtos") rebuilt on the wireframe layout with an app shell and styled confirmations.
  Remaining: re-check against the Figma nodes once the quota resets (ticket 06).
- **catalog-pivot** — robot catalog, checkout by robot + offer with server-side price,
  webhook amount check, per-Licença delivery. See `TODO.md` for what remains.

Not yet built: **license-server** (automated license issuance, `needs-triage`, blocked on the payload
decision — see ADR-0004). Deploy to production is blocked on PLANNING.md §12
prerequisites (Appmax onboarding, Resend domain verification, custom domain) — none of
these block the build or test-phase work.

Several copy items ship wrapped in a `launchBlocking()` marker — drawn from the Figma
frames but not approved to go live (fabricated claims, unverified compatibility, pricing
claims contingent on decisions not yet made). Find them with:

```
grep -rn "launchBlocking(" src/content/
```

See `docs/agents/content-files.md` for the convention.
