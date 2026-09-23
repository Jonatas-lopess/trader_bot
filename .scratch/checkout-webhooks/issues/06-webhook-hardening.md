# 06: Webhook hardening — IP filter, payload-shape validation, rate limit

**What to build:** the defense-in-depth layers that sit in front of the core webhook
handler, so a burst of malformed or malicious POSTs to `/billing/webhook` gets rejected
before it can exhaust the D1 write budget or waste an Appmax status re-fetch.

Governing docs: spec.md's "Webhook trust model" bullet on source-IP filtering and
payload-shape validation; User Stories 11-12.

**Blocked by:** 04 (hardening wraps the core handler; nothing to wrap without it).

**Status:** done

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

## Comments

**IP allowlist**: Appmax has not published a fixed webhook source-IP list anywhere
findable (checked docs.appmax.com.br, help-center.appmax.com.br, general web search).
`APPMAX_WEBHOOK_IPS` ships as an unset env var (`src/shared/env.d.ts`, `.dev.vars.example`)
and fails closed — an empty/unset list rejects every IP rather than letting everything
through. Recorded as a go-live gate in PLANNING.md §12/§13, not a build blocker.

**Rate limiting**: uses Cloudflare's native Rate Limiting binding (ADR-0002's stated reason
for choosing Workers), configured in `wrangler.jsonc` (30 requests/10s per source IP,
`ratelimits`/`WEBHOOK_RATE_LIMITER`) — no hand-rolled D1/KV counter.

A real flood (35 calls to the same key against the real binding) was tried first for the
"flood is rate-limited" test and never once returned `success: false` under
`@cloudflare/vitest-pool-workers` 0.22.0 + miniflare `5.20260815.0-alpha`, despite the
binding's own source (`ratelimit-object.worker.js`) showing a SQL-backed counter meant to
persist across calls within the same durable object. That looks like a local-simulation gap
in this pinned toolchain version rather than anything wrong in this repo's config — verified
the binding is genuinely wired (types generate correctly, `wrangler.configPath` carries
`ratelimits` through same as `d1_databases`) before concluding this. The test in
`webhook-hardening.test.ts` mocks the binding's own outcome instead, so it verifies what
this module actually owns — turning `{ success: false }` into a 429 ahead of the
payload-shape check — not the binding's local-simulation fidelity. A parallel attempt to
verify against `wrangler dev` directly (not vitest) got confounded by Astro's own CSRF
Origin check and didn't reach a clean conclusion either way — not treated as evidence here.
Revisit if a later `@cloudflare/vitest-pool-workers` release changes this, or get a clean
`wrangler dev`/production read on it.
