# 05: Enforce N robôs ativos simultâneos via check-in instance tracking

**What to build:** the plan-cap check on the verify endpoint — an instance id sent alongside
`login + nonce`, a `last_seen_at`-based active-instance count per license, and a reject
response when a *new* instance would exceed the plan's robô cap.

Governing docs: spec.md's §Entitlement enforcement (mechanism, active window, "cap gates
admission of a new instance, never evicts one already counted"), PLANNING §8 ("1 / 3 / robôs
ilimitados simultâneos" — the limit this ticket makes real) and §10 (1.0.0 milestone
"Entitlement enforcement" — this ticket is that milestone's robô-count half; corretora-count
is explicitly not part of it, per spec.md).

**Blocked by:** 01, 02

- [ ] Extend the verify request (ticket 02's `POST /license/verify`) to accept an
      `instance_id` alongside `login`/`nonce`. Schema addition, not a new endpoint.
- [ ] New table (or columns) tracking `(login, instance_id, last_seen_at)` — a successful
      check-in upserts this row's `last_seen_at`, independent of whether the check-in itself
      passes or fails the cap (a rejected-for-cap instance still gets its attempt recorded,
      so retrying doesn't silently succeed via a race).
- [ ] Active-instance count for a `login`: rows where `last_seen_at` is within the active
      window (default 2h, spec.md). Look up the plan's robô cap via
      `subscriptions.plan_id` (existing join path, no new plan-limit table needed if the
      cap is derivable from `plan_id` the way pricing/plan copy already is in
      `src/content/plans.ts`).
- [ ] On a check-in from an `instance_id` **not already active** for that `login`: if the
      active count (excluding this one, since it isn't active yet) is already at the plan's
      cap, the verify response fails for this instance specifically — same generic failure
      shape as any other rejection (no separate "over cap" signal distinguishable from
      "bad signature" at the wire level, consistent with ticket 02's "no oracle" stance).
- [ ] On a check-in from an `instance_id` **already active**: always renews regardless of
      current count-vs-cap — a downgrade or a cap change never evicts a running instance
      mid-check-in.
- [ ] Unlimited-plan `login`s skip the cap check entirely (no active-instance query needed
      to answer "always allow").
- [ ] Tests: first instance under cap admitted; instance beyond cap rejected while the
      under-cap ones keep renewing; an instance that ages out of the active window frees its
      slot for a new one; an already-active instance always renews even when the count is at
      or over cap (simulating a downgrade); unlimited plan never rejects for count.
- [ ] `pnpm test` and `pnpm run typecheck` pass.
