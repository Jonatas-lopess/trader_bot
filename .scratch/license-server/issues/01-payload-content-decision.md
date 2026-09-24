# 01: Decide what the payload actually carries

**What to build:** nothing shippable — a decision, recorded here, on what the server-issued
`payload` blob (spec.md's Solution, piece 4) actually contains for 1.0.0's first cut. Every
other ticket in this effort treats `payload` as opaque bytes; none of them can be
implemented meaningfully until this is answered, because the schema shape (ticket 02), what
gets provisioned (ticket 03), and what the MQL5 client does with a successful response
(ticket 04) all depend on it.

Governing docs: spec.md's own Open Questions ("What exactly `payload` contains ... is a
product decision outside this spec's scope"), ADR-0004 (the payload, not signature strength,
is what "segura de verdade" — PLANNING.md §8's framing — so this decision is the actual
security boundary, not a footnote), spec.md's §Entitlement enforcement (robô-count
enforcement is now scoped separately, ticket 05, as a protocol-level accept/reject — it
doesn't need the plan's numeric limits shipped inside `payload` for the robot to self-check,
which narrows this ticket's option (a) below to whatever *other* plan-derived data, if any,
still needs to travel in-band).

**Blocked by:** —

- [ ] Decide the payload's actual shape: is it (a) plan-derived data the robot itself must
      consume beyond what ticket 05's accept/reject already enforces (§Entitlement
      enforcement handles the robô-count cap server-side; corretora data isn't collected at
      all yet, so option (a) is likely thin or empty for 1.0.0's first cut), (b)
      strategy-critical trading parameters/filters the robot cannot run without (entry/exit
      thresholds, risk sizing, symbol filters), (c) a decryption key for a partially-
      encrypted portion of the compiled logic, or (d) some combination — and which one(s)
      1.0.0 ships first vs. defers.
- [ ] Decide payload size and format (JSON, a fixed binary struct, etc.) — this drives the
      HMAC message construction in ticket 02 and what the MQL5 client (ticket 04) has to
      parse.
- [ ] Decide whether payload content varies only by plan (a handful of fixed variants) or
      is fully per-license (arbitrary per-customer values) — this determines whether
      provisioning (ticket 03) picks from a small fixed set or generates/accepts bespoke
      values per license.
- [ ] Confirm this doesn't reopen brokerage-account binding (spec.md's Implementation
      Decisions keeps that out of scope) — if a candidate payload design requires
      corretora-specific data that isn't collected anywhere yet, that's a scope conflict to
      flag, not silently work around.
- [ ] Record the decision by editing this ticket's body under an `## Answer` heading
      (`docs/agents/issue-tracker.md`'s convention) and updating spec.md's Open Questions
      and Solution (piece 4) to describe the payload concretely instead of as opaque bytes.

## Answer

_Pending — resolve before starting ticket 02._
