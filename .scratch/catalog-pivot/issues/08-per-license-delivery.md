# 08: Per-Licença delivery

**Blocked by:** 02, 07

**Status:** done

**What to build:** download tokens carry `license_id`; redemption streams `licenses/<license_id>.ex5` from R2; minting refused unless the Licença is `active`. Operator flow documented in `docs/ops/`: compile from `robots/<slug>/` with the bound account, upload, flip to `active` (which emails the link). R2 test fixtures updated. Tokens for revoked/expired Licenças refuse to redeem.

Governing docs: ADR-0006, PLANNING.md §8, `.scratch/robot-delivery/`.

- [x] Mint refused for `awaiting_account`/`preparing`
- [x] Redeem streams the per-Licença object; wrong license id 404s
- [x] Refunded Licença cannot redeem an already-minted token
- [x] `pnpm test` and `pnpm run typecheck` pass


## Decisions / Notes

- Migration `0009` makes `download_tokens.license_id` NOT NULL (drop and recreate; no prod data).
- `license_id` = `purchase_id`. Mint (`dispatchDownloadLink`) takes a `licenseId`, resolves the
  Cliente via `customers.purchase_id`, and returns `license_not_active` unless
  `getLicenseStatusById` says `active` (so refunded/chargeback/expired also refuse).
- Redeem returns the token's `license_id`; `resolveDownload` re-checks the Licença is `active`
  before streaming, so a link minted earlier dies on refund/expiry (404, same as unknown/expired).
  An active Licença with no R2 object is a 500 plus a Sentry message, as before.
- The operator flip is `activateLicense` / `pnpm run activate-license`: refuses unless the purchase
  is `active`/`past_due`/`canceled`, the R2 object exists and the Licença is `preparing`; one atomic
  `UPDATE ... WHERE status = 'preparing'`, then emails the link. Runbook: `docs/ops/license-activation.md`.
  `send-download-link` now takes `--license-id`.
- R2 test fixture is per Licença (`test/robot-binary-fixture.ts`, `test/license-seed.ts`).
- `/conta` shows no download button: PLANNING §8 says "no self-service resend for 0.1", so delivery is
  the emailed link only. Add a button only if that rule changes.
- `/conta` hides "Cancelar assinatura" unless the purchase is a Mensal that is `active`/`past_due`.
- **Not fixed:** a repeat buyer still gets a second `customers` row (unique `purchase_id`), so `/login` by
  email reaches one purchase's Licença only. Needs a design call on identity per email.
