# Backlog

Work with no effort directory yet. Not tickets; nothing here is ready to pick up.

## Remaining 0.1 (PLANNING.md §10)

- Legal pages with placeholder text — dropped from `marketing-pages` on purpose, now tracked
  at `.scratch/legal-pages/issues/01-termos-e-privacidade-pages.md`

NFS-e is no longer listed here: `docs/ops/nfse.md`'s own Status section already counts the
structure-with-TODOs scaffold as satisfying "manual NFS-e process documented" — the same bar
PLANNING §9 sets for legal pages, and the one `legal-pages`/01 now follows.

## External prerequisites

None of them code (PLANNING.md §12). Test phase: none block starting the work below —
domain/Appmax onboarding/Resend verification only gate going to production; contador
already engaged.

1. Domain registered and on a Cloudflare zone — go-live only, test phase uses `workers.dev`
2. Appmax onboarding with written approval of the business category — go-live only, build
   against sandbox
3. Resend account with domain verification (SPF/DKIM) — go-live only, build against test mode
4. Appmax's published webhook source-IP list — go-live only; `/billing/webhook` fails closed
   without it (PLANNING.md §12/§13)
5. Contador engaged for NFS-e — done
