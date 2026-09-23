# Backlog

Work with no effort directory yet. Not tickets; nothing here is ready to pick up.

## Remaining 0.1 (PLANNING.md §10)

- Hosted Checkout, webhook, provisional account, the intermediate confirmation page and its boleto branch
- Magic-link login
- Customer area: Licença status, expiry, cancel
- Email with the signed download link
- Legal pages with placeholder text — dropped from `marketing-pages` on purpose
- Manual NFS-e process, documented

## External prerequisites

None of them code (PLANNING.md §12). Test phase: none block starting the work below —
domain/Appmax onboarding/Resend verification only gate going to production; contador
already engaged.

1. Domain registered and on a Cloudflare zone — go-live only, test phase uses `workers.dev`
2. Appmax onboarding with written approval of the business category — go-live only, build
   against sandbox
3. Resend account with domain verification (SPF/DKIM) — go-live only, build against test mode
4. Contador engaged for NFS-e — done
