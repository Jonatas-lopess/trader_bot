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

Pre-implementation. No code yet — see ticket 01 in `TODO.md` for the scaffold.
