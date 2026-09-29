# 08: Per-Licença delivery

**Blocked by:** 02, 07

**Status:** ready-for-agent

**What to build:** download tokens carry `license_id`; redemption streams `licenses/<license_id>.ex5` from R2; minting refused unless the Licença is `active`. Operator flow documented in `docs/ops/`: compile from `robots/<slug>/` with the bound account, upload, flip to `active` (which emails the link). R2 test fixtures updated. Tokens for revoked/expired Licenças refuse to redeem.

Governing docs: ADR-0006, PLANNING.md §8, `.scratch/robot-delivery/`.

- [ ] Mint refused for `awaiting_account`/`preparing`
- [ ] Redeem streams the per-Licença object; wrong license id 404s
- [ ] Refunded Licença cannot redeem an already-minted token
- [ ] `pnpm test` and `pnpm run typecheck` pass

