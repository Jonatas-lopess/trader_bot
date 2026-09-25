# 03: Report webhook-hardening's security-relevant rejections

**What to build:** `src/modules/billing/webhook-hardening.ts` today rejects a delivery with a
403 (source IP not on the allowlist), a 429 (rate limit), or a 400 (payload doesn't match the
expected shape) — and logs nothing at all for any of them. The 403 and 400 cases become
visible in Sentry, carrying the rejection reason and source IP, so once Appmax's real webhook
IP list arrives (PLANNING.md §12, prerequisite 4 — currently unset, fails closed) a false
reject is visible instead of only inferred from "Appmax says the webhook never confirmed"
support tickets.

**429 is deliberately excluded.** `projeto_ebd`'s own rate-limit middleware (`apps/server/src/index.ts`,
the `/billing/webhook`, `/rpc/sync/push` and `/turnstile/verify-waitlist` limiters) never
calls `Sentry.captureException` on a throttled request — ordinary throttling is expected
noise, not an error worth alerting on. Same reasoning applies here: a burst of legitimate
Appmax retries hitting `WEBHOOK_RATE_LIMITER` is not a signal anyone needs paged for.

**Blocked by:** 01 (needs the SDK wired in before anything can call `captureException`)

**Status:** done

- [ ] The 403 (IP-allowlist) rejection path calls `Sentry.captureException`/`captureMessage`
      with the rejected source IP
- [ ] The 400 (bad payload shape) rejection path calls `Sentry.captureException`/`captureMessage`
      with the rejection reason
- [ ] The 429 (rate-limit) rejection path is left untouched — no Sentry call added
- [ ] Existing tests for `webhook-hardening.ts` extended to assert capture fires on the 403
      and 400 paths and does not fire on the 429 path
- [ ] `pnpm test` and `pnpm run typecheck` pass

## Comments

Both captures carry `source_ip` (`null` when the request had none at all); the 400 path
carries a fixed `rejection_reason: 'invalid_payload_shape'` string rather than a
finer-grained reason — `hasValidPayloadShape` only ever returns a boolean today, no detail
to surface beyond "didn't match the expected shape". Tests assert the capture fires on both
403 and 400, and explicitly assert it does *not* fire on 429 or on a legitimate
allowed-IP/well-formed request.
