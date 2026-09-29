# 07: Customer area: Licença states and Corretora account form

**Blocked by:** 02, 05

**Status:** done

**What to build:** customer-area Licença page handles `awaiting_account` (explicit banner + form to enter the Corretora account; download disabled), `preparing`, `active` (with "vitalícia" for Compra), and expired/revoked. The form writes `licenses.corretora_account` once (integer), rejects a second write (operator-only change in 0.1). No Figma frame exists: reuse current customer-area styles. Content in a typed file (`src/content/conta.ts`).

Governing docs: ADR-0006 "Corretora account is collected after payment", PLANNING.md §8, `.scratch/customer-area/issues/03-license-status-page.md`.

- [x] Banner shown while `awaiting_account`, download link absent
- [x] Second submit does not overwrite; non-integer rejected
- [x] Status flips to `preparing` on account entry
- [x] `pnpm test` and `pnpm run typecheck` pass


## Decisions / Notes

- `getLicenseStatus(env, purchaseId, purchaseStatus, now)` folds the row, the purchase and expiry into one state: `none` (no row: pending/rejected), `awaiting_account`, `preparing`, `active`, `expired`, `revoked` (refunded/chargeback).
- `saveCorretoraAccount` (`licensing/corretora-account.ts`): one atomic UPDATE guarded by `corretora_account IS NULL`, `status = 'awaiting_account'` and a non-revoked purchase. Positive integer, no leading zero, max 12 digits. Route: `POST /conta/corretora`, redirects to `/conta?corretora=saved|invalid|exists`.
- Nothing here sets `licenses.status = 'active'`: ticket 08 owns the operator flip (after compile and upload).
- `rejected` copy is final wording, still `launchBlocking` (PLANNING §6).
- Guest-duplicate guard: `licensing/duplicate-license.ts`, called from both webhooks' first-provisioning hook. It reports to Sentry (purchase ids); no schema flag, since no column exists for it.
- Not done: repeat buyers still get a second `customers` row per purchase, so `/login` by email reaches only one purchase's Licença. `/conta` also still shows the cancel button for a Compra (no subscription to cancel). Both need their own tickets.
