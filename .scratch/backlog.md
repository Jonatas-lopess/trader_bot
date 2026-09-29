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

## Open before go-live (catalog-pivot)

Collected from the `catalog-pivot` tickets when the effort closed (2026-09-29). Code is done;
none of this is buildable without an outside answer. Each item names the ticket with the
detail.

### Appmax sandbox checks (PLANNING.md §13)

No test can settle these; each needs one real sandbox call.

- `amounts.sub_total` on `GET /v1/orders/{id}` is in integer cents. The webhook amount check
  depends on it: if wrong, every legitimate Appmax payment lands `rejected`. (04)
- `payment_methods` and `recurring` fields on order creation are honored. If ignored, Mensal
  could be charged once and Boleto/Pix offered on it. (03)
- Mensal two-step flow (order, then `POST /v1/subscriptions`), and whether Pix is allowed as
  its base order (docs say yes, PLANNING §6 says no; driver stays card-only). (03)
- `POST /payment-links` hosted flow: unverified, and whether it collects CPF/CNPJ for every
  method. Fallback is driving customer, order, payment directly. (03, 13)
- `customer.document_number` is non-null per payment method through the real flow. (13)
- `recusado_por_risco` is mapped to `refunded`. It may mean the order was refused and never
  charged; confirm before a refused order gets a Licença revoked or a nota flagged. (04)
- Appmax subscription responses carry no amount, so Mensal purchases skip the amount check. (04)

### Decisions for the owner

- **Repeat buyers.** `customers.purchase_id` is UNIQUE, so a second purchase creates a second
  `customers` row with the same email, and `/login` by email reaches only one purchase's
  Licença. Needs an identity-per-email design call. (02, 07, 08)
- **Guest double payment.** A guest is only identified after payment, so nothing blocks paying
  twice for the same Robô. `licensing/duplicate-license.ts` reports it to Sentry at
  provisioning; the operator resolves by hand (refund). Decide whether that is enough. (03, 07)
- **Download link on `/conta`.** Left out: PLANNING §8 says no self-service resend in 0.1, so
  delivery is email-only. Add a button if that changes. (08)
- **Mensal fiscal data.** Subscription refetch carries no customer, so `buyer_document` is
  NULL for Mensal and the operator enters it by hand for the nota. (13)
- **Nota already issued for a refunded purchase.** Ask the contador whether it must be
  cancelled (`TODO — confirm with contador` in `docs/ops/nfse.md`). (13)
- **Stripe `charge.refunded` and dispute events** are not mapped. Test driver only; matters
  only if Stripe stays anywhere near production. (04)

### Copy and legal (all `launchBlocking`)

- Robot names, prices, descriptions, supported Corretoras: `grep -rn "launchBlocking(" src/content/catalog.ts`. (01)
- Real Termos text including the 7-day withdrawal clause, and the `rejected` copy in
  `src/content/conta.ts`. (04, 07, 09)
- Política de privacidade does not yet list name and CPF/CNPJ under "Dados coletados"
  (`src/content/legal.ts`); the document is LGPD personal data. (13)
- Everything else: `grep -rn "launchBlocking(" src/content/`.
