# Robô Trader

Marketing site and customer area for the Robô Trader, an MT5 (MetaTrader 5) Expert
Advisor. Sells subscriptions, delivers the robot, and lets customers manage their license
— all in one codebase.

The business sells the right to run the robot against a customer's own brokerage account
(Corretora). It never holds or moves customer funds.

## What it does (0.1 scope)

- Landing and plans pages (pt-BR only)
- Hosted checkout with card, Boleto and Pix (Pagar.me)
- Magic-link authentication (no passwords)
- Customer area: license status, key/expiry, cancel subscription
- Robot delivery via a signed, expiring download link (email)
- Legal pages (placeholder text, pending real copy)

Not in 0.1: in-app binary download, automated license issuance, entitlement enforcement,
plan upgrade/downgrade, automated NFS-e emission. See `PLANNING.md` §1.

## Stack

Astro + `@astrojs/cloudflare`, deployed to Cloudflare Workers (Static Assets). D1 for
application state, R2 for the robot binary, Resend for transactional email, Tailwind v4
for styling. Tests with Vitest (webhook/token/session logic) and Playwright (one
checkout-to-customer-area happy path).

## Docs

- `PLANNING.md` — technical contract: scope, stack, payments, auth, licensing, compliance.
  Binding until changed there.
- `CONTEXT.md` — domain vocabulary (Plano, Assinatura, Cliente, Robô, Licença, Chave,
  Corretora, Boleto, Pix).
- `docs/adr/` — architecture decisions.
- `TODO.md` — index of tracked work in `.scratch/`.

## Status

Landing page and plans page implemented (tickets 01–05, 07–08 in `TODO.md`) — Astro +
Cloudflare Workers scaffold, Tailwind v4 design tokens, site shell, hero, video/how-it-works,
plans page, plan teaser and FAQ. Ticket 06 (social proof) is deferred: the frame's metrics
and testimonials are fabricated placeholders (PLANNING.md §2) with no real figures to ship
yet.

Several copy items ship wrapped in a `launchBlocking()` marker — drawn from the Figma
frames but not approved to go live (fabricated claims, unverified compatibility, pricing
claims contingent on decisions not yet made). Find them with:

```
grep -rn "launchBlocking(" src/content/
```

See `docs/agents/content-files.md` for the convention. Not yet built: checkout, auth,
customer area, legal pages, deploy (blocked on PLANNING.md §12 prerequisites).
