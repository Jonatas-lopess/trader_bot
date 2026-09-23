# checkout-webhooks

Status: done

Hosted checkout, the webhook endpoint that keeps an Assinatura's state in sync with
Appmax, the provisional record created at checkout time, and the intermediate
"aguardando confirmação" page (including its Boleto branch). Scope matches
`.scratch/backlog.md`'s "Hosted Checkout, webhook, provisional account, the intermediate
confirmation page and its boleto branch" line, under PLANNING.md §10's 0.1 milestone.

Depends on: `marketing-pages` (the `/planos` page and its `checkoutHref` links already
exist — `src/content/plans.ts`, `src/pages/planos.astro`).

Governing docs: PLANNING.md §6 (Payments — Appmax), §7 (Authentication and account
lifecycle), §5 (code conventions); ADR-0002 (Cloudflare Workers); ADR-0003 (Appmax as
gateway, supersedes ADR-0001); CONTEXT.md (Cliente, Assinatura, Plano, Robô, Licença,
Boleto, Pix).

## Problem Statement

A visitor on `/planos` can pick a Plano but has no way to pay for it — the three
`checkoutHref` links (`/checkout?plan=starter|pro|enterprise`) point nowhere yet. Once a
Cliente does pay, nothing in the system learns about it: there is no Assinatura record,
no webhook endpoint for Appmax to call, and no page that tells the Cliente their payment
went through. Boleto in particular confirms up to a business day late (CONTEXT.md), and
without a durable, replay-safe way to receive that confirmation, a Cliente who paid has
no path to finding out.

Appmax also gives weaker guarantees than a typical gateway: no HMAC signature on
webhooks, no documented retry policy, and no ordering guarantee (ADR-0003). A naive
handler that trusts a webhook payload's contents can double-charge a side effect on a
retried delivery, or apply a stale event that arrived late and silently downgrade an
active Assinatura.

## Solution

`/checkout?plan=<id>` creates an Appmax hosted-checkout session for that Plano and
redirects the Cliente to it, alongside a provisional D1 record keyed to that checkout
attempt. Appmax's hosted page collects payment (card à vista, Boleto, or Pix per §6 —
Appmax's own surface decides which methods to present for a recurring Plano). On return,
the Cliente lands on an intermediate confirmation page that polls a status endpoint
rather than trusting the redirect alone, so the page's state (aguardando, confirmado, or
the Boleto-specific "confirmação em até 1 dia útil" message) always reflects the
database, not an assumption about how fast Appmax's webhook arrives.

The webhook endpoint at `/billing/webhook` treats every delivery as a pointer, not a
fact: it responds `200` immediately, and for every event it re-fetches the referenced
order/subscription's current authoritative status from the Appmax API before writing
anything (ADR-0003; Appmax's documented best practice pasted into this effort's
originating conversation). Writes are idempotent by `order_id + event` (`subscription_id
+ order_id + event` for subscription-lifecycle events) and are applied as a single
compare-and-swap statement per event, so two concurrent or out-of-order deliveries can
never interleave a read and a write from two different requests.

## User Stories

1. As a Cliente who clicked "Assinar Starter" on `/planos`, I want to be taken straight
   to a payment page, so that I can pay without creating an account first.
2. As a Cliente on the Appmax hosted checkout page, I want to pay with card à vista,
   Boleto, or Pix, so that I can use whichever method I already trust.
3. As a Cliente who just paid by card, I want to see confirmation within seconds, so
   that I know the payment went through before I try to access anything.
4. As a Cliente who just paid by Boleto, I want to be told my confirmation can take up
   to a business day, so that I don't think the payment failed when nothing happens
   immediately.
5. As a Cliente sitting on the intermediate confirmation page, I want it to reflect the
   real, current state of my payment, so that a slow or dropped webhook doesn't leave me
   staring at a stale "aguardando" message forever without recourse.
6. As a Cliente, I want my Assinatura to be created exactly once even if I refresh the
   checkout page or Appmax retries its webhook, so that I am never charged or provisioned
   twice for one payment.
7. As the business, I want every webhook delivery's raw payload stored before
   processing, so that a support case or a processing bug can be diagnosed and replayed
   without depending on Appmax resending anything.
8. As the business, I want a webhook that arrives out of order (e.g. a `canceled` event
   processed before an earlier `active` event that was delayed) to never leave an
   Assinatura in a state less current than one it already reached, so that Appmax's lack
   of an ordering guarantee can't put an active Cliente into a stale-canceled or
   stale-active state.
9. As the business, I want a webhook referencing a subscription/order we have no record
   of to be ignored (not to throw, not to create a phantom record), so that a
   misconfigured Appmax webhook or a payload for a different environment doesn't corrupt
   data.
10. As the business, I want the webhook handler to never trust a payload's own status
    field, so that a forged or malformed POST to `/billing/webhook` (no HMAC exists to
    reject it outright) can't move money-adjacent state without Appmax's own API
    confirming it first.
11. As the business, I want `/billing/webhook` to respond fast regardless of how long
    the Appmax status re-fetch or the D1 write takes, so that Appmax's 5-second timeout
    never triggers an unnecessary retry storm.
12. As the business, I want webhook flooding from one source to be rate-limited, so that
    a burst of malformed or malicious POSTs can't exhaust the D1 write budget.
13. As a developer extending this later (magic-link login, customer area), I want a
    clear, documented point in the webhook flow where an Assinatura first becomes
    active, so that I can hook a "send magic link" step onto it without touching the
    webhook's idempotency or state-machine logic.
14. As the business, I want the provisional record created at checkout-session time to
    carry enough information (which Plano, which checkout attempt) that the webhook can
    find and update the right row without the Cliente having authenticated first — per
    §7, the account is provisioned from payment, not before it.

## Implementation Decisions

**No payment-provider interface.** Appmax is the sole, committed gateway (ADR-0003, no
swap planned). `modules/billing` calls the Appmax hosted-checkout and status-lookup APIs
directly; an abstraction layer for a hypothetical second provider is not built (PLANNING
§5's stance against speculative generality).

**Checkout session creation.** `/checkout?plan=<id>` resolves `plan` against the
existing `PlanId` union in `src/content/plans.ts` (`starter | pro | enterprise`),
creates an Appmax hosted-checkout session for that Plano's monthly price (annual is out
of scope — no annual price is set anywhere yet, per that file's `launchBlocking` note),
and writes a provisional D1 row before redirecting. The exact Appmax request/response
shape (how the return redirect identifies which checkout attempt just completed) is not
fully known yet and is confirmed against Appmax's sandbox during implementation, not
guessed here — this is the one open integration detail in this spec.

**Provisional record.** A row representing the checkout attempt (Plano id, a generated
or Appmax-issued reference, and a status: `pending | active | past_due | canceled`) is
written at session-creation time, before payment. No Cliente identity (email, name) is
required to create it — per §7, that arrives with the payment. `owner`/tenant concepts
from other billing systems don't apply here: one Cliente, one Assinatura, no branch/HQ
hierarchy.

**Status endpoint.** A small read-only endpoint the intermediate confirmation page polls
(~2s interval, per §7 — no WebSocket, no Durable Object) by the checkout attempt's
reference, returning one of: pending, active, or a Boleto-specific "awaiting up to one
business day" state distinguished from generic pending so the page can show the right
copy per user story 4.

**Webhook trust model** (ADR-0003; Appmax's documented best practices):

- Every delivery triggers exactly one Appmax API call to fetch the referenced
  order/subscription's current authoritative status. The payload is used only to know
  *which* record to check, never trusted for the status itself.
- Idempotency key: `order_id + event` for one-time events, `subscription_id + order_id +
  event` for subscription-lifecycle events (Appmax's own recommendation).
- The raw payload (full JSON) is stored before any processing, independent of the
  idempotency check, for debugging and manual replay.
- Source-IP filtering (Appmax's published webhook IPs) and payload-shape validation
  against an expected schema sit in front of the handler as defense-in-depth — neither
  substitutes for the API re-fetch.
- The handler responds `200` before the Appmax status re-fetch or D1 write are
  guaranteed to have finished being *observed* by the caller — i.e. processing happens
  synchronously in the request but the response is not gated on anything beyond what's
  needed for correctness. This is safe for 0.1 because Cloudflare Workers' CPU-time
  budget excludes I/O wait; no queue or background job is introduced. Revisit only if
  real Appmax retry behavior or volume proves this insufficient (PLANNING §13 already
  flags Appmax's retry behavior as unverified).
- A subscription/order the webhook references but that has no matching D1 row is
  ignored, not treated as an error and not used to create a new row (user story 9).

**D1 concurrency — compare-and-swap, not read-then-write.** D1 is single-threaded per
database (one Durable Object, one query at a time), which does not by itself prevent a
`SELECT` in one request from being interleaved by another request's write before that
first request's own `UPDATE` runs. Two mechanisms close that window, each a single
atomic statement instead of a read followed by a write:

1. **Idempotency.** An insert into a processed-events table keyed by the composite id
   above; a uniqueness violation on that insert *is* the "already processed" result —
   no prior `SELECT` to race against.
2. **State transition.** A single `UPDATE` whose `WHERE` clause both targets the row and
   compares the current status's rigidity against the new status's rigidity inline (a
   `CASE`-based ranking, not a separate read), so a less-current event can never
   overwrite a more-current state. Whether the write applied is read off the statement's
   affected-row count, not a follow-up `SELECT`.

**Module boundary.** All of the above lives in `modules/billing`. The point where an
Assinatura first transitions to `active` is the single hook future work (magic-link
send, customer-area provisioning) attaches to — described here as an integration point,
not built as an event bus or callback mechanism, since nothing consumes it yet.

## Testing Decisions

**One seam: the outbound HTTP call to Appmax.** Everything else — Worker routing, the
`/billing/webhook` and `/checkout` handlers, D1 reads and writes including the
compare-and-swap and idempotency statements — runs against the real Workers runtime and a
real D1 binding via `@cloudflare/vitest-pool-workers` (new dependency; today's
`vitest.config.ts` is plain Vitest with no Workers pool). Only `fetch` calls to Appmax's
API are mocked, so the compare-and-swap and idempotency behavior is tested against real
D1 semantics rather than a hand-rolled stub that could drift from them.

Tests only assert on external behavior: given a sequence of webhook POSTs (in whatever
order, including duplicates), the resulting Assinatura status and the webhook endpoint's
HTTP responses — not on which internal function got called.

Covered: idempotent replay of the same event, out-of-order delivery (a less-current
event arriving after a more-current one), an unknown subscription/order reference,
concurrent delivery of two events for the same subscription, the checkout-session →
provisional-record → webhook-confirms-active happy path, and the Boleto branch's status
endpoint response before confirmation arrives.

Prior art: PLANNING §5 already commits Vitest to "the webhook handler, token issuance
and session validation" as the three places a bug costs money or grants unauthorized
access — this is the first of those three to be built. No existing test file to mirror
yet (`src/modules/billing/.gitkeep` is still empty); this ticket sets the pattern the
other two follow.

## Out of Scope

- Annual billing and the Pix steer described in PLANNING §6 — no annual price exists yet
  (`src/content/plans.ts`), tracked separately.
- Magic-link token issuance, sending, and redemption — separate backlog item
  ("Magic-link login"). This spec produces the hook point (Assinatura → active) but not
  the email or the login flow itself.
- The authenticated customer area (Licença status, cancel-subscription UI) — separate
  backlog item.
- Licença issuance, entitlement counting/enforcement, and the signed download link email
  — PLANNING §8, explicitly out of 0.1 (manual issuance) and a separate backlog item
  regardless.
- Multi-day dunning beyond what Appmax itself retries — flagged in PLANNING §6 as ours to
  build, not part of this phase.
- Chargeback handling.
- Any provider other than Appmax.
- Parcelamento (installments) — deferred to 1.0.0 by product decision (PLANNING §6),
  unrelated to any gateway limit.

## Further Notes

- The exact Appmax hosted-checkout request/response contract (how the post-payment
  redirect identifies which checkout attempt completed, and the precise fields on the
  status-lookup response) is not fully pinned down in this spec — confirm against
  Appmax's sandbox docs during implementation. Everything else here (idempotency key
  shape, trust model, D1 concurrency approach) does not depend on that detail.
- PLANNING §13 lists Appmax's retry behavior on failed recurring charges, and its exact
  webhook retry/ordering behavior, as unverified against the live contract. The
  "always re-fetch, never trust the payload" design in this spec is deliberately
  insensitive to whatever that turns out to be.
- The provider-interface pattern and the Postgres `FOR UPDATE`-based idempotent
  state-machine RPC seen in the `projeto_ebd` reference codebase informed this spec's
  webhook design, but neither transfers directly: that codebase supports two providers
  (hence the interface) and runs on Supabase/Postgres (hence row locks), neither of which
  applies here.
