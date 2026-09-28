# 01: Termos de uso and Política de privacidade pages — structure + placeholder text

**What to build:** the two legal pages PLANNING §10 lists as 0.1 scope
("Legal pages with placeholder text") and that `marketing-pages` deliberately dropped
(`src/content/dead-links.ts` — "legal pages are out of scope for the marketing slice"). This
is the one remaining piece to close 0.1: everything else in `.scratch/backlog.md`'s
"Remaining 0.1" list is either done (NFS-e — `docs/ops/nfse.md`'s own Status section already
counts the scaffold-with-TODOs as satisfying the milestone, same bar this ticket follows) or
a non-code external prerequisite (§12).

Governing docs: PLANNING.md §9 ("Legal pages ... ship with structure and placeholder text
carrying TODOs. Real text comes from you or a lawyer. Generated legal copy is a liability
for a product in this category, not a shortcut."), `docs/agents/content-files.md` (typed
content-file convention; the dead-links convention this ticket retires for these two links),
`src/content/dead-links.ts`, `src/content/footer.ts` (current inert entries),
`src/layouts/base-layout.astro` (per-page title/description/OG convention every other page
already follows).

**Blocked by:** —

- [ ] **No AI-generated legal text.** Do not write actual Termos de uso or Política de
      privacidade prose — PLANNING §9 is explicit that generated legal copy is a liability,
      not a shortcut. Each page ships with real section headings (the structure a
      Termos/Privacidade page is expected to have — escopo do serviço, responsabilidades,
      cancelamento, dados coletados, etc.) and a clearly marked placeholder body per
      section, e.g. `TODO — texto definitivo pendente de revisão jurídica`, mirroring
      `docs/ops/nfse.md`'s own `TODO — confirm with contador` pattern.
- [ ] Two new pages, prerendered static like the rest of the marketing slice: pick routes
      (e.g. `/termos-de-uso`, `/privacidade`) and add them under `src/pages/`, each using
      `base-layout.astro` with its own `lang="pt-BR"` title/description/OG tags, consistent
      with `planos.astro`/`index.astro`.
- [ ] Content lives in typed content files per `docs/agents/content-files.md`
      (`src/content/termos-de-uso.ts`, `src/content/privacidade.ts` or a single
      `src/content/legal.ts` — pick one, don't split arbitrarily), not inline strings in the
      `.astro` templates.
- [ ] Retire `termosDeUso` and `politicaDePrivacidade` from `src/content/dead-links.ts`'s
      dead set and give them real `href`s in `src/content/footer.ts`'s `supportLinks` (they
      stop being `DeadFooterLink`s and become ordinary `FooterLink`s) — `contato` stays dead,
      out of scope for this ticket. Update `site-footer.astro`/`site-header.astro` only if
      their rendering logic assumed all three entries were dead (check before assuming a
      change is needed there).
- [ ] The AVISO LEGAL disclaimer (`footer.ts`'s `legalNotice`) is unaffected — it's real,
      already-approved compliance copy, not a placeholder; this ticket doesn't touch it.
- [ ] Tests: page renders (existing Playwright/unit coverage pattern for marketing pages, if
      any — check `test/` for precedent before adding a new one), dead-link grep
      (`grep -rn "deadLinks\." src/`) no longer lists these two keys as rendered inert, and
      `pnpm run build` succeeds with the new static routes.
- [ ] `pnpm test` and `pnpm run typecheck` pass.

## Answer

_Not yet triaged._
