# PLANNING.md — Robô Trader

Technical contract for the Robô Trader sales site. Records the macro decisions taken
before implementation, what was deliberately deferred, and what is still open.

**Catalog pivot (ADR-0006).** The site sells a Catálogo of Robôs, not Planos. Read
ADR-0006 first; where this file still says "plan" it means the pivot has not reached that
sentence yet, and ADR-0006 wins.

Decisions here are binding until changed in this file. Hard-to-reverse choices carry an
ADR in `docs/adr/`. Domain vocabulary lives in `CONTEXT.md`.

Last updated: 2026-10-05 (customer-area layout, figma-restyle/04)

---

## 1. Scope

A marketing site that sells a Catálogo of Robôs (each an MT5 Expert Advisor) plus a small
authenticated customer area, in one codebase.

**In scope for 0.1**

- Landing page and `/catalog` page (replaces `/planos`), from the Figma wireframes
- Checkout by `robot_id` + Oferta (Compra, Anual, Mensal), payment confirmation, purchase lifecycle
- Magic-link authentication
- Customer area: Licença status, expiry, Corretora account entry, cancel Assinatura
- Email delivery of the Licença's compiled robot via a signed, expiring download link
- Legal pages (structure and placeholder text)

**Explicitly out of scope for 0.1**

- In-app download of the binary (1.0.0)
- Automated license issuance and per-Licença compile (1.0.0, researched together)
- Live Corretora-account enforcement at check-in (1.0.0)
- Rental-to-Compra conversion (1.0.0)
- Annual auto-renew and its reminder email (1.0.0)
- Cart / multi-Robô checkout
- Automated NFS-e emission (1.0.0; manual issuance in 0.1 — see §9)
- Any locale other than pt-BR
- Paid-traffic tracking pixels and consent management

---

## 2. Product decisions

**Language.** pt-BR only. Content is hardcoded in typed content files, not a CMS. No i18n
framework — retrofitting one is roughly a day's work if a second locale is ever needed.

**Launch copy carries no fabricated social proof.** Every metric and testimonial in the
current wireframes is placeholder: `+2.500 traders ativos`, `R$ 12M+ operados`, and the
three named testimonials. These are replaced with verifiable figures or removed before
launch. Two independent reasons:

1. CDC art. 37 treats invented performance claims as *publicidade enganosa*.
2. Payment processors judge category risk on marketing copy. Stripe's *prohibited*
   business list includes "'get rich quick' schemes, including investment opportunities
   or other services that promise high rewards to mislead consumers" — language like
   "resultados consistentes" and "fechei os últimos 3 meses no positivo" maps onto it
   directly. This applies to any processor, not only the one we chose.

**Responsive design is derived, not designed.** The Figma file contains two 1440px desktop
frames and no mobile artboards. Breakpoints and stacking rules are derived from the
desktop frames and reviewed against real devices. The 4-step row, the testimonial row and
the robot-card row each collapse to a single column. Brazilian consumer traffic is majority
mobile, so this is the larger half of the audience arriving at an underspecified layout —
tracked as a known risk, not a solved problem.

---

## 3. Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Astro + `@astrojs/cloudflare` | Marketing pages prerendered |
| Hosting | Cloudflare Workers with Static Assets | Not Pages — see ADR-0002 |
| Database | D1 | Single store for all application state |
| Object storage | R2 | Robot binary, served through a Worker binding |
| Email | Resend | Plain `fetch`, no SDK |
| Error tracking | `@sentry/cloudflare`, `Sentry.withSentry` as the outermost Worker export (`sentry.server.config.ts`) | Error capture only, `tracesSampleRate: 0` — no stated need for performance tracing yet. Unset `SENTRY_DSN` ships fine, same gate convention as Appmax/Resend. `environment` tag read per-request off `SENTRY_ENVIRONMENT`, falling back to `'unconfigured'` rather than Sentry's own `'production'` default (sentry-integration/issues/07) |
| Styling | Tailwind v4, `@theme` tokens | Color, radius, border-width and elevation tokens follow the Figma Variables (`--rt-*`, figma-restyle); layout primitives and the type-size scale are still authored by hand. Roles Figma does not draw are marked "derived, not in Figma" in `global.css` |
| Fonts | `@fontsource/geist`, `@fontsource/manrope`, `@fontsource/geist-mono` | Self-hosted WOFF2, Latin subset only, `font-display: swap`; no third-party font request. Geist headings, Manrope body, Geist Mono data (figma-restyle/03) |
| Icons | `@lucide/astro` | Per-icon Astro components, tree-shaken to only what's imported. `lucide-astro` (no scope) is deprecated upstream in favour of this package — do not add it |
| Analytics | Cloudflare Web Analytics | Cookieless, no consent banner required |
| Video | YouTube iframe | Loaded directly |
| Tests | Vitest + Playwright | See §5 |
| CI/CD | GitHub Actions → `wrangler deploy` | |

**Astro SSR requires** the `nodejs_compat` and `global_fetch_strictly_public` compatibility
flags.

**Next.js was rejected.** Cloudflare's current default adapter (`vinext`) is beta, and
`@opennextjs/cloudflare` caps the worker at 3 MiB compressed on the free plan — a Next.js
bundle can exceed that, forcing a paid upgrade for bundle headroom alone.

### Platform constraints to design against

- **10 ms CPU per request** on the Workers free plan. Webhook signature verification and
  token hashing use Web Crypto and stay lean.
- **Static asset requests are free and unlimited.** Prerendered marketing pages consume no
  request quota; only the authed area and webhooks count against 100k/day.
- **KV is not used for auth state.** The free plan allows 1,000 writes/day to distinct keys
  and is eventually consistent. "Invalidate this single-use token now" is exactly what
  eventual consistency gets wrong. Magic-link tokens and sessions live in D1.
- **D1's primary is single-region.** Marketing pages stay fully static, and session
  validation prefers a signed cookie over a database round-trip. D1 read replication exists
  but is beta and requires the Sessions API; not used.
- **Workers cannot open SMTP connections.** Transactional email must be an HTTP API.

---

## 4. Module layout

Plain code organisation. Modules are folders with a shared vocabulary, not an architectural
framework: no aggregate roots, no repository interfaces, no cross-module contract layer.
Modules import each other directly.

```
src/
├── pages/          Astro routes (presentation)
├── components/
├── modules/
│   ├── billing/    catalog offers, purchases, payment provider, webhooks, dunning, cancellation
│   ├── identity/   customers, magic-link tokens, sessions
│   └── licensing/  licenses, expiry, Corretora account binding, binary storage, download tokens, dispatch
└── shared/         ids, dates, environment bindings, D1 client
```

Tactical patterns get introduced where an invariant demands them, not upfront. The first
genuine candidate is Licensing deriving Licença expiry from purchase status (ADR-0006) —
one function, never edited by hand independently of the purchase.

---

## 5. Code conventions

- **Functional.** Pure functions, no classes, no `this`. Inputs are never mutated.
- **Naming.** kebab-case filenames, camelCase functions and values, PascalCase types.
  `type` over `interface`.
- **Identifiers in English**, except domain terms with no faithful translation:
  `Corretora`, `Boleto`, `Pix` keep their Portuguese names.
- **Errors.** Discriminated unions for expected failures (payment declined, token expired,
  session invalid). `throw` is reserved for genuine bugs. No `Result` wrapper type, no
  monadic plumbing.
- **Tests.** Vitest covers the webhook handler, token issuance and session validation —
  the three places where a bug costs money or grants unauthorised access. Playwright covers
  one checkout-to-customer-area happy path. Marketing pages are verified against the Figma
  frames, not unit-tested.

---

## 6. Payments — Appmax

Chosen over Stripe and Pagar.me. Rationale and trade-offs in ADR-0003 (supersedes
ADR-0001).

**Methods per Oferta** (ADR-0006). Compra and Anual: card, Boleto, Pix. Mensal: card only.
Earlier drafts listed Boleto as recurring on Appmax; that is dropped — recurring Boleto would
mean dunning around a one-business-day confirmation lag, and one-time Boleto already covers
Boleto buyers. Checkout hides Pix and Boleto when Mensal is chosen.

**Pix is not available for recurring billing** on Appmax, Pagar.me or a Brazilian Stripe
account. Appmax does not appear among providers with a shipped merchant-side Pix
Automático API. Stripe shipped Pix Automático but its documentation states it is
unavailable for accounts in Brazil. This is a rails limitation, not a vendor one.

**The Anual Oferta is a single charge, steered toward Pix.** Appmax's published rates: card à
vista 3.49% + R$0.99 flat (4.99% below R$100k monthly revenue), Pix 0.99%, boleto a flat
R$3.49 (not a percentage). Settlement is D+30 by default; D+1 advance costs an extra 1.49%.
Pix is markedly cheaper per transaction and, unlike card, is not sitting on a 30-day
settlement — the catalog page should make Pix the obvious annual choice. Anual does not auto-renew in
0.1 (ADR-0006); card auto-renew and its reminder email are 1.0.0. These figures replace the Pagar.me quotes previously here and still need re-verification against the live
Appmax contract before launch (§13).

**No parcelamento in 0.1, by choice rather than gateway limit.** Unlike Pagar.me, Appmax
does support installments on recurring charges (up to 21x, at 1.89% per installment on top
of the base rate). Offering "12x" would still mean deciding how a parcelled annual charge
interacts with subscription renewal — that product decision is undone, so parcelamento
stays deferred to 1.0.0 (§10) until customers actually ask, not because the API forbids it.

**Hosted Checkout in 0.1.** PCI scope drops to near zero and Pix, Boleto and card arrive in
one surface. Cost: less control over the highest-converting screen and a visual seam
against the Figma design. Revisit with conversion data, not before.

**What Appmax does not provide, and we therefore build:**

- A customer self-service portal. Cancellation UI is ours. This is not optional — the FAQ
  promises "cancelar quando quiser com um clique" and it is a CDC right. No evidence Appmax
  ships one either.
- Multi-day dunning. Retry cadence and the emails around it are ours; Appmax's own retry
  behaviour on failed recurring charges is unverified (§13).
- **Defensive webhook handling.** Appmax documents which subscription events fire
  (creation, cancellation, recurring charge) but not signature verification, retry policy
  or ordering guarantees. See "Checkout and webhook implementation" below for the concrete
  handling.
- **Chargeback handling.** Appmax mediates chargebacks directly (unlike Pagar.me, which
  routes disputes through the acquirer) but charges 15% of the recovered amount on a
  successful active-collection recovery.

### Price integrity (ADR-0006)

- **Before payment (blocks tampering).** Checkout accepts only `robot_id` + `offer` from the
  client. The price comes from `src/content/catalog.ts`; unknown `robot_id` or `offer` is
  rejected and no session is created. The catalog is bundled into the Worker, with no runtime
  write path.
- **Stored expectation.** `amount_cents` is written on the purchase row at session creation.
- **After payment (cannot block).** The webhook compares the amount the gateway reports
  against the stored `amount_cents`, never the live catalog. Mismatch moves the purchase to
  `rejected`, reports to Sentry (purchase id, expected, reported), and the confirmation page
  says payment was received and is under review. The Cliente *was* charged: copy never says
  otherwise and never suggests buying again. Operator resolves manually in 0.1 (flip to
  `active` after review, or refund in Appmax). Copy is `launchBlocking`.

### Purchase status ranking

`purchases.status` is rank-ordered: `pending` < `rejected` < `active` < `past_due` <
`canceled` < `refunded` < `chargeback`. The compare-and-swap below applies unchanged: a
lower-ranked event never overwrites a higher one. Chargeback ranks above refund because it is
adversarial and cannot be un-disputed.

### Checkout and webhook implementation

**Appmax is the committed gateway** (ADR-0003, supersedes ADR-0001), with no swap planned
for production.

**A narrow, test-only `IPaymentProvider` seam exists** (ADR-0005), reopening what this
section previously ruled out ("no payment-provider interface... an abstraction would be
built for a second implementation that doesn't exist — speculative generality §5 already
rules out"). That second implementation now exists for a concrete reason: Appmax's own
account creation is currently blocked, so a Stripe test-mode driver stands in for local
checkout-flow testing until it isn't. `modules/billing/factory.ts` selects the driver off
`PAYMENT_PROVIDER`, defaulting to Appmax for anything but an explicit `"stripe"`; never set
to `stripe` in a deployed environment. The seam covers only checkout-session creation,
authoritative-status refetch and cancellation — webhook ingestion is deliberately excluded
and stays one module per gateway (see ADR-0005 for why). Revisit ADR-0005 once Appmax
onboarding succeeds; the intent is Appmax-only, not two gateways indefinitely.

**Webhook trust model, per Appmax's own documented best practices** (no HMAC signature is
provided):

- Respond `200` before processing. Appmax's timeout is 5s; synchronous processing is fine
  for 0.1 because Workers' 10ms CPU budget excludes I/O wait — a D1 round trip does not
  burn CPU quota. No queue/background job needed unless webhook volume or Appmax's retry
  behaviour later proves this wrong.
- Idempotency key: `order_id + event` for one-time events, `subscription_id + order_id +
  event` for subscription events (Appmax's own recommendation).
- Store the raw payload (full JSON) before processing, for debug and manual replay.
- Don't trust event order. Delays and retries can reorder delivery — decisions are made
  against current stored state, not the payload's implied sequence.
- No HMAC to verify origin. The payload only identifies which order/subscription to
  check — every event triggers one Appmax API call to fetch that record's current
  authoritative status before any state transition is applied (ADR-0003); the payload's
  own status field is never trusted. Source-IP filtering (Appmax's published webhook IPs)
  and payload-shape validation against the expected schema sit on top as defense-in-depth,
  not a substitute for the API confirm.

**D1 concurrency: no `FOR UPDATE` equivalent, so no split read-then-write.** A D1 database
is single-threaded — one query at a time, backed by one Durable Object — but that only
serializes individual statements. A `SELECT` then a later `UPDATE` from the same request
can still have another request's statements interleave between them, the same TOCTOU
window Postgres's `FOR UPDATE` closed in the projeto_ebd reference. D1's answer: put the
check inside the write, so each step is one atomic statement instead of two.

1. **Idempotency as one statement.** `INSERT INTO processed_webhooks (id) VALUES (?)`
   where `id` is the composite key above and `PRIMARY KEY`. A `UNIQUE` constraint
   violation *is* the "already processed" signal — no `SELECT` first.
2. **Status transition as one compare-and-swap `UPDATE`.** No `SELECT` beforehand either:
   `UPDATE purchases SET status = ? WHERE subscription_id = ? AND <CASE-based rigidity of
   current status> <= <rigidity of new status>`, rigidity expressed inline via `CASE` in
   the `WHERE` clause. Read `meta.changes` on the result to know whether it applied. This
   also drops the projeto_ebd RPC's separate race-tie re-resolution step — there's nothing
   left to race.

---

## 7. Authentication and account lifecycle

**Magic link.** No passwords: no reset flow, no credential storage, no breach surface.

**The account is provisioned from payment, not before it.** Every field placed ahead of the
payment button costs conversion.

**Checkout sequence**

1. A provisional record is created when the checkout session is created.
2. The customer pays and is redirected to an intermediate page: *"Aguardando confirmação do
   pagamento…"*. The page polls a status endpoint (~2s interval; no WebSocket or Durable
   Object needed at this scale).
3. On confirmation the page becomes *"Entrar na área do cliente"*.
4. The webhook is the durable confirmation that flips the record to active.

The success page resolves state server-side by session ID rather than waiting on the
webhook. Without this, a customer can land on the customer area before the webhook arrives
and see an error on the highest-emotion screen in the funnel.

**Boleto has no instant path.** Boleto confirms in up to one business day. That branch of
the intermediate page explains that access arrives by email once payment clears, and the
magic link is sent on confirmation. Any flow assuming "pay → immediately see your key"
breaks for boleto customers and must not be written that way.

---

## 8. Licensing and delivery

**Today each Robô is an MT5 Expert Advisor licensed by expiry date and issued manually.**
There is no license server and no per-customer key.

**One Licença = one Robô = one Corretora account (ADR-0006).** The Planos' entitlement counts
("N robôs ativos", "N corretoras") are gone, so there is nothing left to count or enforce
by number.

**Per-Licença compiled binary.** The Corretora account is baked into the binary, so each
Licença is compiled separately. Licença status: `awaiting_account` → `preparing` → `active`.

1. Payment confirms; the Licença row is created `awaiting_account`.
2. The customer area shows an explicit banner and form: enter the Corretora account. Download
   is disabled until set. Set once by the Cliente; only the operator can change it in 0.1.
3. Status becomes `preparing`. The operator compiles from `robots/<slug>/` in R2 (source,
   never served) and uploads `licenses/<license_id>.ex5`.
4. Status becomes `active`; the signed download link is emailed.

Automated compile is 1.0.0, researched alongside license-authority automation.

Consequences, stated rather than hidden:

- **Sharing the binary is limited by the baked-in account** but not eliminated until live
  check-in verification (`license-server`) ships.
- **Issuance has a human in it.** The customer area shows *status* and must not promise an
  instant key.
- **The customer area shows what 0.1 can back.** `/conta` ("Meus produtos") has its own app
  shell (account header with tab bar, slim footer; `BaseLayout` `shell="account"`) and one lean
  card per Licença: Robô, Oferta, state badge, Licença, Assinatura and Corretora account, plus
  the account form and the cancel control the state allows. The Figma wireframes also draw a
  license-key box, a download button, an invoice table, an upgrade card and a Cliente name;
  none exists in 0.1 (no key, email-only delivery, no invoice data, no plan tiers, no name
  held), so none is built. The support button has no destination yet (`deadLinks.suporte`).
  Cancel and the Corretora account are confirmed in a styled `<dialog>`, not the browser's
  `confirm()`.
- **Expiry follows purchase status** through one derivation function. A Compra's Licença is
  perpetual (far-future `expires_at`); `canceled` keeps the paid term, `refunded` and
  `chargeback` set expiry to now.

**Delivery.** The robot is emailed as a signed, expiring download link, never as an
attachment. Executable attachments are blocked outright by Gmail, Outlook and most
corporate filters, including inside a `.zip`. A password-protected archive is worse — that
pattern is what marks a sender as malware.

**Link mechanics.** An opaque token is stored in D1 with a 24–48h TTL, a `license_id` and a `used_at`
column (`DECISIONS_temp.md` §4). The
Worker redeems the token and streams the file from the R2 binding. R2 presigned URLs were
rejected: they cannot be used with custom domains (S3 endpoint only) and have no
single-use mode, expiry only. R2 egress is free, so re-issuing links costs nothing.

---

## 9. Compliance

Selling software as a service from a Brazilian CNPJ carries an ISS obligation — the STF
settled the tax nature of software licensing in 2021 (ADI 1945, ADI 5659), and LC 116/2003
covers it. MEI is exempt from issuing to a *pessoa física* buyer but not to a PJ buyer, and
MEI's R$81k annual ceiling is crossed at roughly 70 customers at the lowest-priced Oferta (placeholder until catalog prices are set).

Acquirers report card volume to the Receita Federal. Revenue arriving through the payment
provider is visible whether or not notas are issued.

0.1 issues notas manually through the municipal portal; automation via a dedicated issuer
is deferred. **ISS rules and rates are municipal — confirm specifics with the contador.**
Nothing in this document is tax advice.

**Withdrawal.** CDC art. 49 gives a 7-day *arrependimento* on online sales, and Compra is
perpetual. Honored in 0.1 by manual refund through the Appmax dashboard; the Licença is
revoked by setting its expiry to now. Termos de uso carries the clause (placeholder text,
real wording from a lawyer).

**Legal pages** (Termos de uso, Política de privacidade) ship with structure and
placeholder text carrying TODOs. Real text comes from you or a lawyer. Generated legal copy
is a liability for a product in this category, not a shortcut. The customer area opens both
as a modal from its footer (`legal-dialog.astro`); the `/termos-de-uso` and `/privacidade`
routes stay for the marketing footer and direct links.

---

## 10. Milestones

**0.1**

- Landing page and `/catalog` page, responsive
- Hosted Checkout by `robot_id` + Oferta, webhook → provisional account → active, with amount check
- Intermediate confirmation page, including the boleto branch
- Magic-link login
- Customer area: Licença status, Corretora account entry, expiry, cancel Assinatura
- Email with signed download link to the per-Licença binary (compiled manually)
- Legal pages with placeholder text
- Manual NFS-e process documented

**1.0.0**

- In-app download in the customer area
- Automated license issuance and per-Licença compile (license authority)
- Live Corretora-account enforcement at check-in
- Rental-to-Compra conversion
- Annual auto-renew (card) with its reminder email, 15 days before renewal
- Automated NFS-e emission
- Parcelamento, if demand appears
- Custom checkout, if conversion data justifies it

---

## 11. Open decisions

Recorded deliberately. Not to be resolved by assumption during implementation.

**License model.** Partly decided (ADR-0006): one Licença = one Robô = one Corretora account,
account collected in the customer area after payment. Still open: the site becoming the
license authority that mints per-Licença keys and compiles automatically (1.0.0, research
needed), and how live check-in verification interacts with a manually compiled binary.
Nothing in the catalog wireframes collects the account number; the customer-area form is new
UI with no Figma frame.

**Download-link tool.** Shape agreed (Worker + D1 token + R2 binding). Link lifetime
decided: 24–48h TTL, never a permanent/public link (`DECISIONS_temp.md` §4). Remaining
details — one-time versus reusable within the window, re-issue flow, abuse controls —
decided at build time.

**Scheduled (end-of-period) cancellation.** 0.1 cancels immediately on request — the
Assinatura's status flips to `canceled` right away, and the Licença keeps running to its
own already-set expiry regardless (independent lifecycles, CONTEXT.md). Letting a Cliente
instead schedule cancellation for the end of the current paid period is deferred; revisit
if customers ask for it, not before.

---

## 12. Prerequisites

External, none of them code. Split by what they actually block.

**Blocks going live (production), not the build:**

1. **Domain registered and on a Cloudflare zone.** Test phase deploys to the `*.workers.dev`
   subdomain on the personal Cloudflare account — no custom domain needed yet. Needed before
   download links and staging move off `workers.dev`.
2. **Appmax onboarding with written approval of the business category.** A
   trading-automation product discovered after the fact is how accounts get frozen with
   receivables inside. Disclose the product in writing during risk analysis and keep the
   approval on record. Integration work itself proceeds against Appmax's sandbox/test mode;
   onboarding is a CI/CD-time (go-live) gate, not a code blocker. **Currently blocked**:
   Appmax account creation itself has not gone through yet, ahead of even the sandbox step —
   ADR-0005's Stripe test driver exists to keep checkout-flow testing unblocked in the
   meantime, not to change this prerequisite.
3. **Resend account with domain verification (SPF/DKIM).** Magic-link deliverability in
   production depends on it, and a magic link that lands in spam is a customer who cannot log
   in. Same as Appmax: build and test against Resend's test mode/sending, verify the domain
   before flipping to production sends. **Currently using Resend's shared test sender**
   (`onboarding@resend.dev`, `src/modules/identity/resend-client.ts`) since `robotrader.com.br`
   is unverified — go-live must swap `FROM_ADDRESS` back to `login@robotrader.com.br` once
   verification lands. The shared sender only delivers to the Resend account owner, so a
   test env used by anyone else sets `DEV_LOGIN_KEY` and logs in via
   `GET /login/dev?email=<cliente>&key=<DEV_LOGIN_KEY>` (no e-mail sent; 404 when the secret
   is unset). Never set in production.
4. **Appmax's published webhook source-IP list, once Appmax provides one.** §13 —
   `APPMAX_WEBHOOK_IPS` (`src/modules/billing/webhook-hardening.ts`) ships unset and fails
   closed until then; `/billing/webhook` rejects every delivery, Appmax's included, so this
   blocks the webhook actually working in production, not just a hardening nicety.

**Done:**

5. **Contador engaged** for NFS-e.

Environments: production and staging as separate Workers environments, staging behind
Cloudflare Access. Access is for us and reviewers only — it is seat-based and must never be
used for paying customers. During test phase, staging also lives on `workers.dev`.

---

## 13. Facts not independently verified

Research behind these decisions was gathered from vendor documentation. The following were
flagged as unverified at the time of writing and should be confirmed before they are relied
on:

- Appmax's fee schedule in §6 against the live contract at signup time — published rates
  change, and volume tiers may move the effective rate
- Appmax's minimum payout and payout fees
- Appmax's webhook signature verification, retry policy and ordering guarantees — the
  reason for the defensive handling in §6
- Appmax's multi-day dunning behaviour and subscription status transitions
- Cloudflare Email Sending pricing (documentation page returns 404)
- Whether Cloudflare imposes a free-plan restriction on Workers custom domains
- Appmax's hosted-checkout/payment-link request and response field names (auth flow,
  endpoint paths, `external_id` round-tripping) — no sandbox credentials were available
  during `checkout-webhooks`; `src/modules/billing/appmax-client.ts`'s header comment has
  the detail. **Correction, found in code review:** this was originally written as
  "everything downstream of that module does not depend on these exact names," which
  overstates the isolation for one specific path — `webhook.ts`'s compare-and-swap `WHERE
  (appmax_order_id = ? OR appmax_subscription_id = ?)` is the only way the webhook finds a
  row, and `appmax_order_id` is populated straight from the unverified `data.order_id`
  response field. If Appmax's real field differs, that column stays `NULL` and the webhook
  can never match the row — the Assinatura would stay `pending` forever. Ticket 02's own
  Comments scope the "reference round-trips" guarantee correctly (to the confirmation-page
  `return_url` redirect only); this file's blanket claim did not. Verify `data.order_id`
  against a real sandbox call before go-live — this is a functional dependency, not just a
  cosmetic one.
- Appmax API facts read from docs.appmax.com.br on 2026-09-29, none yet exercised against a
  live sandbox: yearly interval is documented (`POST /v1/subscriptions`, `interval`
  `month`/`year`, `interval_count`, `max_cycles`) but needs a sandbox confirmation; the amount
  to compare is `amounts.sub_total` on `GET /v1/orders/{id}` (`total_paid` includes
  `installment_fee`); order and subscription endpoints need merchant credentials and `/v1`
  paths; cancel is `PATCH /v1/subscriptions/{id}/cancel` and is immediate; webhook payloads
  wrap ids in `data`. Order statuses and their mapping live in
  `.scratch/catalog-pivot/issues/04-webhook-amount-check.md`.
- Buyer CPF/CNPJ for NFS-e (`.scratch/catalog-pivot/issues/13-fiscal-data-for-nfse.md`), read
  from docs.appmax.com.br on 2026-09-29, not sandbox-verified: `GET /v1/orders/{id}` returns
  `customer.name`, `customer.email` and `customer.document_number`; `document_number` is
  optional on customer creation, but card (`holder_document_number`) and Pix
  (`payment_data.pix.document_number`) payments require one (Boleto not read). Unknown:
  whether the hosted `payment-links` flow collects it for every method and whether it lands on
  `customer.document_number` in the refetch. Confirm on a sandbox call before go-live.
- Subscription base orders may be card **or Pix** per the docs, against §6's "no Pix for
  recurring". Unresolved: keep Mensal card-only until a sandbox test or Appmax says otherwise.
- Appmax's published webhook source-IP list — not findable anywhere (docs.appmax.com.br,
  help-center.appmax.com.br, general web search), so `APPMAX_WEBHOOK_IPS` ships unset;
  `src/modules/billing/webhook-hardening.ts` fails closed on that, not open.
