# 14: Identity per email — one customer, many purchases

**Blocked by:** —

**Status:** done

**What to build:** make email the identity key. Today `customers.purchase_id` is UNIQUE, so a second purchase by the same email creates a second `customers` row and `/login` reaches only one purchase's Licença. Move to one `customers` row per normalized email, with many purchases and Licenças under it.

- **Schema.** New migration: drop UNIQUE on `customers.purchase_id`, add UNIQUE on `email`, reset not migrate (ADR-0006: only test-phase data exists; no merge step, no backfill). No real rows exist: owner checked the Cloudflare D1 databases on 2026-09-29 and they are clear.
- **`normalizeEmail(raw): string | null`** in `src/modules/identity/normalize-email.ts`. Trim, split on the last `@`, require exactly one non-empty local part and one non-empty domain, lowercase the whole address, reject non-ASCII. Return `null` when malformed; callers reject and never fall back to the raw value. No Gmail dot/plus folding (plus-aliases stay distinct), no abbreviation expansion, no dot rewriting, no regex/DNS/MX validation. Replaces the copies of `.trim().toLowerCase()` in `licensing/duplicate-license.ts`, `identity/magic-link.ts`, `identity/customers.ts` and the buyer-email read at provisioning.
- **Provisioning.** Find-or-create the customer by normalized email; attach the purchase to it.
- **`/login`.** Magic link resolves to the customer, so the session sees every purchase.
- **`/conta`.** List every Licença on one page, grouped by Robô, each with its own state and Corretora account form.
- **ADR-0006.** Add a note that the identity model changed.

Governing docs: ADR-0006, CONTEXT.md, `.scratch/backlog.md` "Repeat buyers".

- [x] `normalizeEmail` tests: casing, surrounding whitespace, missing `@`, double `@`, empty parts, non-ASCII, plus-aliases stay distinct
- [x] Two purchases by the same email yield one `customers` row and two Licenças
- [x] Magic-link login for that email reaches both Licenças; `/conta` lists both, grouped by Robô
- [x] Same email in different casing resolves to the same customer
- [x] The duplicate-license Sentry report still fires when the same Robô is bought twice
- [x] `pnpm test` and `pnpm run typecheck` pass
