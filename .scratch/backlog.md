# Backlog

Work with no effort directory yet. Not tickets; nothing here is ready to pick up.

## Remaining 0.1 (PLANNING.md §10)

Nothing left untracked. Legal pages (dropped from `marketing-pages` on purpose) now has its
own effort directory and ticket: `.scratch/legal-pages/issues/01-termos-e-privacidade-pages.md`
(`needs-triage`) — see `TODO.md`.

NFS-e is not listed here: `docs/ops/nfse.md`'s own Status section already counts the
structure-with-TODOs scaffold as satisfying "manual NFS-e process documented" — the same bar
PLANNING §9 sets for legal pages, and the one `legal-pages`/01 now follows.

## External prerequisites

None of them code (PLANNING.md §12). Test phase: none block starting the work below —
domain/Appmax onboarding/Resend verification only gate going to production; contador
already engaged.

1. Domain registered and on a Cloudflare zone — go-live only, test phase uses `workers.dev`
2. Appmax onboarding with written approval of the business category — go-live only, build
   against sandbox
3. Resend account with domain verification (SPF/DKIM) — go-live only, build against test mode.
   Using `onboarding@resend.dev` as sender meanwhile (`src/modules/identity/resend-client.ts`);
   go-live must swap `FROM_ADDRESS` to `login@robotrader.com.br` once verified.
4. Appmax's published webhook source-IP list — go-live only; `/billing/webhook` fails closed
   without it (PLANNING.md §12/§13)
5. Contador engaged for NFS-e — done
