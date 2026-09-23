# PLANNING.md — Robô Trader

Technical contract for the Robô Trader sales site. Records the macro decisions taken
before implementation, what was deliberately deferred, and what is still open.

Decisions here are binding until changed in this file. Hard-to-reverse choices carry an
ADR in `docs/adr/`. Domain vocabulary lives in `CONTEXT.md`.

Last updated: 2026-09-23

---

## 1. Scope

A marketing site that sells the Robô Trader (an MT5 Expert Advisor) plus a small
authenticated customer area, in one codebase.

**In scope for 0.1**

- Landing page and plans page, both from the Figma wireframes
- Checkout, payment confirmation, subscription lifecycle
- Magic-link authentication
- Customer area: license status, key/expiry, cancel subscription
- Email delivery of the robot via a signed, expiring download link
- Legal pages (structure and placeholder text)

**Explicitly out of scope for 0.1**

- In-app download of the binary (1.0.0)
- Automated license issuance (1.0.0)
- Entitlement enforcement (1.0.0)
- Plan upgrade and downgrade (1.0.0)
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
the plan-card row each collapse to a single column. Brazilian consumer traffic is majority
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
| Styling | Tailwind v4, `@theme` tokens | Figma file defines zero variables; tokens authored by hand |
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
│   ├── billing/    plans, subscriptions, payment provider, webhooks, dunning, cancellation
│   ├── identity/   customers, magic-link tokens, sessions
│   └── licensing/  keys, expiry, entitlements, binary storage, download tokens, dispatch
└── shared/         ids, dates, environment bindings, D1 client
```

Tactical patterns get introduced where an invariant demands them, not upfront. The first
genuine candidate is Licensing enforcing "N robôs ativos simultâneos" — which does not
exist yet (§11).

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

**Methods.** Card à vista (recurring), Boleto (recurring), Pix (one-time only).

**Pix is not available for recurring billing** on Appmax, Pagar.me or a Brazilian Stripe
account. Appmax does not appear among providers with a shipped merchant-side Pix
Automático API. Stripe shipped Pix Automático but its documentation states it is
unavailable for accounts in Brazil. This is a rails limitation, not a vendor one.

**Annual plans are a single charge, steered toward Pix.** Appmax's published rates: card à
vista 3.49% + R$0.99 flat (4.99% below R$100k monthly revenue), Pix 0.99%, boleto a flat
R$3.49 (not a percentage). Settlement is D+30 by default; D+1 advance costs an extra 1.49%.
Pix is markedly cheaper per transaction and, unlike card, is not sitting on a 30-day
settlement — the pricing page should make Pix the obvious annual choice. These figures
replace the Pagar.me quotes previously here and still need re-verification against the live
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

### Checkout and webhook implementation

**No payment-provider interface.** Appmax is the committed gateway (ADR-0003, supersedes
ADR-0001) with no swap planned. An `IPaymentProvider` abstraction would be built for a
second implementation that doesn't exist — speculative generality §5 already rules out.
`modules/billing` calls the Appmax hosted-checkout API directly.

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
   `UPDATE plans SET status = ? WHERE subscription_id = ? AND <CASE-based rigidity of
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

**Today the robot is an MT5 Expert Advisor licensed by expiry date and issued manually.**
There is no license server and no per-customer key.

Consequences, stated rather than hidden:

- **Plan entitlements are unenforceable.** The plans sell "1 / 3 / robôs ilimitados
  simultâneos" and "1 / 3 / corretoras ilimitadas". Nothing in the system can count or cap
  either, and a single buyer can share the binary freely. This is an accepted 0.1 trade-off.
- **Issuance has a human in it.** The customer area shows *status* — "licença sendo
  preparada" → "ativa até DD/MM" — and must not promise an instant key.

**Delivery.** The robot is emailed as a signed, expiring download link, never as an
attachment. Executable attachments are blocked outright by Gmail, Outlook and most
corporate filters, including inside a `.zip`. A password-protected archive is worse — that
pattern is what marks a sender as malware.

**Link mechanics.** An opaque token is stored in D1 with a 24–48h TTL and a `used_at`
column (`DECISIONS_temp.md` §4). The
Worker redeems the token and streams the file from the R2 binding. R2 presigned URLs were
rejected: they cannot be used with custom domains (S3 endpoint only) and have no
single-use mode, expiry only. R2 egress is free, so re-issuing links costs nothing.

---

## 9. Compliance

**NFS-e is obligatory and will be issued manually in 0.1.**

Selling software as a service from a Brazilian CNPJ carries an ISS obligation — the STF
settled the tax nature of software licensing in 2021 (ADI 1945, ADI 5659), and LC 116/2003
covers it. MEI is exempt from issuing to a *pessoa física* buyer but not to a PJ buyer, and
MEI's R$81k annual ceiling is crossed at roughly 70 Starter customers.

Acquirers report card volume to the Receita Federal. Revenue arriving through the payment
provider is visible whether or not notas are issued.

0.1 issues notas manually through the municipal portal; automation via a dedicated issuer
is deferred. **ISS rules and rates are municipal — confirm specifics with the contador.**
Nothing in this document is tax advice.

**Legal pages** (Termos de uso, Política de privacidade) ship with structure and
placeholder text carrying TODOs. Real text comes from you or a lawyer. Generated legal copy
is a liability for a product in this category, not a shortcut.

---

## 10. Milestones

**0.1**

- Landing page and plans page, responsive
- Hosted Checkout, webhook → provisional account → active
- Intermediate confirmation page, including the boleto branch
- Magic-link login
- Customer area: license status, key/expiry, cancel
- Email with signed download link
- Legal pages with placeholder text
- Manual NFS-e process documented

**1.0.0**

- In-app download in the customer area
- Automated license issuance (license authority)
- Entitlement enforcement
- Plan upgrade and downgrade
- Automated NFS-e emission
- Parcelamento, if demand appears
- Custom checkout, if conversion data justifies it

---

## 11. Open decisions

Recorded deliberately. Not to be resolved by assumption during implementation.

**License model.** The site will become the license authority that mints per-customer keys,
possibly bound to a brokerage account number. Deferred; decided when the customer area is
built. Note that binding to a brokerage account requires *collecting* that account number,
which no current wireframe does.

**Download-link tool.** Shape agreed (Worker + D1 token + R2 binding). Link lifetime
decided: 24–48h TTL, never a permanent/public link (`DECISIONS_temp.md` §4). Remaining
details — one-time versus reusable within the window, re-issue flow, abuse controls —
decided at build time.

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
   onboarding is a CI/CD-time (go-live) gate, not a code blocker.
3. **Resend account with domain verification (SPF/DKIM).** Magic-link deliverability in
   production depends on it, and a magic link that lands in spam is a customer who cannot log
   in. Same as Appmax: build and test against Resend's test mode/sending, verify the domain
   before flipping to production sends.
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
- Appmax's published webhook source-IP list — not findable anywhere (docs.appmax.com.br,
  help-center.appmax.com.br, general web search), so `APPMAX_WEBHOOK_IPS` ships unset;
  `src/modules/billing/webhook-hardening.ts` fails closed on that, not open.
