# Robô Trader

Marketing site and customer area for the Robô Trader, an MT5 (MetaTrader 5) Expert
Advisor. Sells a catalog of robots, delivers them, and lets customers manage their license
— all in one codebase.

The business sells the right to run the robot against a customer's own brokerage account
(Corretora). It never holds or moves customer funds.

## What it does (0.1 scope)

- Landing and `/catalog` pages (pt-BR only): compact card grid, "Saiba mais" modal, catalog in D1 (ADR-0008)
- Cart (`/carrinho`, browser-side, never holds a price) paid in one checkout: one Appmax order, one Licença per unit (ADR-0008)
- Own checkout form with card, Boleto and Pix on Appmax's API (card tokenized in the browser by Appmax JS, ADR-0007)
- Admin area (`/admin`, magic link + `ADMIN_EMAILS`): create, edit, publish and archive Robôs; resend failed e-mails
- Encomenda page (`/encomenda`): custom-work request stored, e-mailed to the operator and offered on WhatsApp
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

## Local catalog seed

The catalog lives in D1 (`robots`, `robot_offers`; ADR-0008) and ships empty: real Robôs are
created from the admin. For local development, load the five placeholder Robôs after applying
the migrations:

```
pnpm exec wrangler d1 migrations apply trader-bot-db --local
pnpm exec wrangler d1 execute trader-bot-db --local --file=scripts/seed-catalog.sql
```

`scripts/seed-catalog.sql` is dev-only and re-runnable. It is never a migration and has no
production path.

To try the cart and checkout locally, run `pnpm build` then `pnpm preview`, add Robôs to the cart
on `/catalog` and open `/carrinho`. "Finalizar compra" goes to `/checkout?line=<robô>:<oferta>:<qtd>&...`.
Paying needs Appmax sandbox credentials (`.dev.vars`); the Stripe test driver
(`PAYMENT_PROVIDER=stripe`, ADR-0005) takes one item per checkout and answers a larger cart with
"Carrinho indisponível".

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
- **appmax-checkout** — own checkout form on Appmax (card, Pix, Boleto), pay endpoint,
  confirmation states, webhook on the real events. Sandbox verification (08) waits on the
  Appmax account.
- **storefront-v2** — catalog in D1 with the admin area, card grid and "Saiba mais" modal,
  repeat purchases, cart paid in one order (N Licenças, webhook over the order group),
  Encomenda page, e-mail dead letter.

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
