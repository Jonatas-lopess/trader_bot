# 06: Webhook hardening — IP filter, payload-shape validation, rate limit

**What to build:** the defense-in-depth layers that sit in front of the core webhook
handler, so a burst of malformed or malicious POSTs to `/billing/webhook` gets rejected
before it can exhaust the D1 write budget or waste an Appmax status re-fetch.

Governing docs: spec.md's "Webhook trust model" bullet on source-IP filtering and
payload-shape validation; User Stories 11-12.

**Blocked by:** 04 (hardening wraps the core handler; nothing to wrap without it).

**Status:** ready-for-agent

- [ ] Requests are filtered against Appmax's published webhook source IPs before reaching
      the core handler.
- [ ] Incoming payload shape is validated against an expected schema before the core
      handler processes it.
- [ ] Neither check substitutes for the core handler's Appmax status re-fetch (spec.md is
      explicit: "neither substitutes for the API re-fetch") — both layers reject early,
      they don't grant trust.
- [ ] A burst of malformed/flooding POSTs from one source is rate-limited so it can't
      exhaust the D1 write budget (User Story 12).
- [ ] `/billing/webhook` still responds fast enough to avoid triggering Appmax's 5s-timeout
      retry storm under normal load (User Story 11) — these layers don't introduce a slow
      path for legitimate requests.
- [ ] Tests: a request from a non-Appmax IP is rejected; a malformed payload is rejected;
      a flood from one source gets rate-limited; a legitimate request still reaches and is
      processed by the core handler from ticket 04.
- [ ] `npm test` and `npm run typecheck` pass.
