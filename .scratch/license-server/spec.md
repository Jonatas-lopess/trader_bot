# license-server

Status: needs-triage

A license-verification protocol between this server and the MT5 Expert Advisor (Robô) it
already delivers: the Robô checks in at init and hourly with `login + nonce`, the server
answers with a signed `{login, nonce, validade, payload}`, and the Robô refuses new entries
(never touches an already-open position) if the check fails or the server is unreachable
past a tolerance window. Scope matches the four-piece design given for this effort and
ADR-0004's decision to use per-license HMAC-SHA256 rather than asymmetric signing. The same
check-in also carries PLANNING §10's 1.0.0 "Entitlement enforcement" milestone for the
robô-count half of it (§Entitlement enforcement below) — folded into this effort rather than
a separate spec, since it rides the same wire protocol and the same per-license row.

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

## Entitlement enforcement (robô count)

PLANNING §8 names the two entitlements the plans sell but nothing enforces: "1 / 3 / robôs
ilimitados simultâneos" and "1 / 3 / corretoras ilimitadas." This effort enforces the first
half — **simultaneous active robôs** — as an extension of the same check-in, not a second
protocol:

- The Robô generates and persists a random **instance id** locally on first run (once per
  install, not per check-in — the same id every hour from the same machine/terminal) and
  sends it alongside `login + nonce`.
- The server records `(login, instance_id, last_seen_at)`. An instance counts as **active**
  if its last successful check-in is within a short multiple of the hourly interval (e.g. 2
  hours) — tolerating one missed beat without flapping a still-running robô in and out of
  the count.
- On a check-in from an instance id **not already active** for that `login`, the server
  counts currently-active instances against the plan's robô cap (1/3/unlimited — the plan
  lookup path already exists via `subscriptions.plan_id`). Over cap: the verify response
  fails for that new instance specifically — existing active instances are never evicted to
  make room; the plan's own quota is the only thing that gates a *new* one starting.
- An already-active instance always renews regardless of the cap — the cap gates admission
  of a new instance, not continued operation of ones already counted, so a cap lowered by a
  downgrade (out of scope — §11) can't retroactively kill a running robô mid-position.

**Corretora count is explicitly not covered by this ticket.** Capping "corretoras
vinculadas" requires knowing which brokerage account each check-in is trading through, which
means collecting that account number — PLANNING §11's own caveat that this "requires
*collecting* that account number, which no current wireframe does" is unchanged by this
effort. CONTEXT.md also hasn't decided whether one Robô ativo implies exactly one Corretora
vinculada. Both are separate product/data-collection decisions, not implementation details
of this check-in — flagged here rather than silently assumed.

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
9. As the business, I want a Cliente on the Starter plan (1 robô) blocked from running a
   second simultaneous copy, so that the plan's own sold limit is actually enforced.
10. As a Cliente already running my entitled number of robôs, I want each of them to keep
    checking in and trading normally — the cap only ever stops a *new* instance from being
    admitted, never interrupts one already running.
11. As a Cliente who stops one robô and starts another (e.g. new machine), I want the freed
    slot to become available again once the old instance's last-seen check-in ages out
    (§Entitlement enforcement's active window), not permanently consumed.
12. As the business, I want it visible in this spec that corretora-count enforcement is not
    part of this effort, so nobody assumes the plan's "corretoras" limit is enforced once
    this ships.

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

**Active-instance window: 2 hours** (2× the hourly check-in interval), same "configurable,
not hardcoded to that exact value at the type level" stance as the 24h tolerance window —
default and the one covered by tests.

**Instance id is generated and persisted by the Robô, not issued by the server.** The server
never needs to hand one out; it only needs the id to be stable per install and unique enough
not to collide across a Cliente's own multiple installs (a random value generated once,
persisted to the same config/license file ticket 03 already delivers, is sufficient — no new
delivery mechanism).

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
