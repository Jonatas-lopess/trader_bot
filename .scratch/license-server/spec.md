# license-server

Status: needs-triage

A license-verification protocol between this server and the MT5 Expert Advisor (Robô) it
already delivers: the Robô checks in at init and hourly with `login + nonce`, the server
answers with a signed `{login, nonce, validade, payload}`, and the Robô refuses new entries
(never touches an already-open position) if the check fails or the server is unreachable
past a tolerance window. Scope matches the four-piece design given for this effort and
ADR-0004's decision to use per-license HMAC-SHA256 rather than asymmetric signing.

Depends on: `robot-delivery` (done) — the single fixed `.ex5` this effort turns into a
per-license artifact; `customer-area`'s `licenses` table (migrations/0005), which today
carries only `status`/`expires_at` and gets extended here, not replaced.

Governing docs: PLANNING.md §8 (today: no license server, no per-customer key — this effort
is what supersedes that), §11 (License model — mints per-customer keys, possibly bound to a
brokerage account; this effort implements that, brokerage-account binding still out of
scope — see Implementation Decisions), CONTEXT.md (Robô — one program, not a family; this
effort makes the *payload* per-license while the compiled `.ex5` stays one program, per
Implementation Decisions below), ADR-0004 (HMAC over RSA/Ed25519 — the crypto decision this
spec assumes).

## Problem Statement

`robot-delivery` ships the exact same `.ex5` to every customer, and `licenses`
(migrations/0005) has no key column "deliberately" — PLANNING §8 already names the
consequence: "a single buyer can share the binary freely," and "nothing in the system can
count or cap" the plan entitlements it sells (1/3/unlimited robôs, 1/3/unlimited
corretoras). That was an accepted 0.1 trade-off, not a permanent one — §11 already names
this as deferred 1.0.0 work. This effort is that work: a per-license check-in that lets a
single compromised or leaked copy be revoked without touching every other customer, and
moves the actually load-bearing logic (not just a license flag) into something the server
withholds until the check passes.

## Solution

Four pieces, per the original design:

1. **Server** stores, per license: `login` (maps 1:1 to today's `licenses.subscription_id`
   — see Implementation Decisions), a per-license HMAC secret (ADR-0004), `validade`
   (renamed/reused from `expires_at`), and a `payload` blob — the operative parameters/
   filters the robot needs to actually trade, not shippable inside the public binary.
2. **Robô** embeds no per-customer secret at compile time; the secret and initial payload
   are provisioned into the robot's config at delivery (see ticket 03), keeping the
   compiled `.ex5` itself identical for every customer (CONTEXT.md — "one program, not a
   family of them" stays true at the binary level; per-license state lives in config/
   license file alongside it, not in the executable).
3. At init and every hour, the robot sends `login + nonce` (nonce: fresh random value,
   robot-generated, one-time) to the server's verify endpoint.
4. **Server responds** `{login, nonce, validade, payload}` plus an HMAC-SHA256 tag over
   that tuple, keyed with that license's secret. The robot recomputes the HMAC with its own
   embedded secret and accepts only if: tag matches, `nonce` echoes what it sent (replay
   defense), `login` matches its own, and `validade` hasn't passed. Any failure — bad tag,
   mismatched nonce/login, expired `validade`, or no reachable server — blocks new order
   entries; positions already open are never touched (explicit rule, independent of cause).
   An unreachable server is tolerated for a bounded window (Implementation Decisions) before
   it starts blocking, so a transient outage doesn't strand paying customers.

## User Stories

1. As the business, I want each sold Robô copy tied to one license with its own secret and
   expiry, so that leaking or cracking one customer's copy doesn't expose every customer.
2. As the business, I want to revoke a single license (stop returning a valid signed
   response for its `login`) without affecting any other customer's check-ins.
3. As a Cliente running the Robô normally, I want hourly check-ins to be invisible — no
   trading interruption — as long as my license is valid and the server is reachable.
4. As a Cliente whose license expired, I want the Robô to stop opening new entries but never
   close or abandon a position that's already open.
5. As a Cliente hitting a transient network or server outage, I want a bounded grace period
   (tolerance window) before the Robô starts blocking new entries, so a short outage doesn't
   cost me trades I'm otherwise entitled to.
6. As an attacker who has extracted my own copy's embedded secret, I want that to be useless
   for forging a response for anyone else's `login`, and useless past my own `validade`.
7. As an attacker who has patched the binary to skip the check, I want to still be missing
   the operative payload data the robot actually needs to trade, so bypassing the check
   alone isn't sufficient to run the strategy.
8. As an attacker attempting to replay a previously-valid server response, I want the nonce
   check to reject it, since a fresh nonce is required each check-in.

## Implementation Decisions

**`login` reuses `subscription_id`, not a new identifier.** `licenses.subscription_id` is
already the natural key tying a license to one Assinatura (migrations/0005's own reasoning:
"one Licença per Assinatura in 0.1"). No new identity concept is introduced here — CONTEXT.md
already treats Assinatura and Licença as independent-lifecycle but 1:1-linked concepts for
0.1's scope, and this effort doesn't reopen that.

**Brokerage-account binding stays out of scope**, per §11's own caveat that it "requires
*collecting* that account number, which no current wireframe does" — unchanged by this
effort. `payload` may eventually carry corretora-specific filters once that data exists, but
this effort doesn't add a collection flow for it.

**Delivery mechanism for the per-license secret and initial payload reuses `robot-delivery`'s
signed-link pattern**, not a new channel: the compiled `.ex5` (unchanged, one program) plus a
small per-license config/license file, both delivered through the existing download-token
flow (ticket 03 scopes exactly what changes there).

**Tolerance window: 24h**, per the original brief's own example figure. Configurable, not
hardcoded to that exact value at the type level, but 24h is the default and the one covered
by tests.

**HMAC-SHA256 over RSA/Ed25519** — ADR-0004; not re-litigated here.

**No admin UI for issuing/revoking a license in this effort.** Same "issuance has a human in
it" shape PLANNING §8 already accepts for 0.1 — a script (mirroring
`scripts/provision-customer.ts`, `scripts/send-download-link.ts`) is sufficient scope, not a
new authenticated admin route.

## Open Questions

- Exact wire format (JSON over HTTPS assumed, not specified further) and the verify
  endpoint's path/auth (it needs no customer session — the robot calls it directly, so it's
  a new unauthenticated-but-signed surface, distinct from `customer-area`'s cookie-gated
  routes).
- What exactly `payload` contains for 1.0.0's first cut — moved out of this list and into
  ticket 01, which every other ticket is now blocked on; resolve there, then update this
  spec's Solution (piece 4) to describe the payload concretely.
