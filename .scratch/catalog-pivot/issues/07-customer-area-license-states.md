# 07: Customer area: Licença states and Corretora account form

**Blocked by:** 02, 05

**Status:** ready-for-agent

**What to build:** customer-area Licença page handles `awaiting_account` (explicit banner + form to enter the Corretora account; download disabled), `preparing`, `active` (with "vitalícia" for Compra), and expired/revoked. The form writes `licenses.corretora_account` once (integer), rejects a second write (operator-only change in 0.1). No Figma frame exists: reuse current customer-area styles. Content in a typed file (`src/content/conta.ts`).

Governing docs: ADR-0006 "Corretora account is collected after payment", PLANNING.md §8, `.scratch/customer-area/issues/03-license-status-page.md`.

- [ ] Banner shown while `awaiting_account`, download link absent
- [ ] Second submit does not overwrite; non-integer rejected
- [ ] Status flips to `preparing` on account entry
- [ ] `pnpm test` and `pnpm run typecheck` pass

