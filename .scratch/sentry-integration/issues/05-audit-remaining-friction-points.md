# 05: Identify and report remaining friction points

**What to build:** tickets 01–03 wired Sentry into the Worker and covered the billing
webhook's known caught-and-handled failures (3 sites) plus `webhook-hardening.ts`'s
security-relevant rejections (403/400). Those were scoped to billing specifically. This
ticket is a repo-wide audit for other caught-and-handled failure branches — outside billing —
that silently return/no-op or only `console.error` today, where a staff member would want a
Sentry event instead of Workers-log access to notice. Candidates to check, not a final list:

- `src/modules/identity/` — magic-link verification/expiry paths beyond the send failure
  already covered in ticket 02
- `src/modules/licensing/` (or wherever license issuance/validation lives) — activation
  failures, seat-limit rejections
- `src/modules/delivery/` or download-token handling — expired/invalid/already-used token
  paths
- `scripts/provision-customer.ts` and any other manual-recovery script's own failure paths
- Any Resend/email send failures outside magic-link (e.g. receipts, notifications)

For each site found: same additive `Sentry.captureException`/`captureMessage` pattern as
ticket 02 (keep existing `console.error`, add Sentry call alongside, structured context —
customer/subscription/order id as available), same "ordinary/expected, not an error" filter
as ticket 03's 429 exclusion — ticket only reports sites that are actually **caught
failures**, not every branch that returns early.

**Blocked by:** 01 (needs the SDK wired in before anything can call `captureException`)

**Status:** needs-triage

- [ ] Repo-wide grep/review for caught-and-handled failure branches outside
      `src/modules/billing/` that currently only log to console or nothing at all
- [ ] Findings written up per-site (file, condition, why it's a friction point worth paging
      on vs. expected/noisy) before any capture code is added
- [ ] Agreed sites get `Sentry.captureException`/`captureMessage` with structured context,
      additive to existing `console.error`
- [ ] Existing tests extended per site to assert capture fires under the triggering condition
- [ ] `pnpm test` and `pnpm run typecheck` pass
