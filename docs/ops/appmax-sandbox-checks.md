# Appmax sandbox checks

Pre-go-live gates (PLANNING.md §13). No test can settle these; each needs one real sandbox
call. Run them when sandbox credentials exist, record each result here and in §13, and fix
the code named in "If wrong". Endpoints: auth `https://auth.sandboxappmax.com.br/oauth2/token`,
API `https://api.sandboxappmax.com.br` (`src/modules/billing/appmax-client.ts`).

Get a token once and reuse it (client credentials, from `APPMAX_CLIENT_ID` / `APPMAX_CLIENT_SECRET`):

```
TOKEN=$(curl -s -X POST https://auth.sandboxappmax.com.br/oauth2/token \
  -d grant_type=client_credentials -d client_id=$APPMAX_CLIENT_ID -d client_secret=$APPMAX_CLIENT_SECRET \
  | jq -r .access_token)
```

Confirm the token request's exact encoding against `appmax-client.ts:72` first.

Result column: `pending`, `ok` or `wrong: <what happened>`.

| # | Check | How | If wrong | Result |
| --- | --- | --- | --- | --- |
| 1 | `amounts.sub_total` on `GET /v1/orders/{id}` is integer cents | Pay a sandbox order for a known price, then `curl -H "Authorization: Bearer $TOKEN" .../v1/orders/<id>` and compare `amounts.sub_total` with `amount_cents` | Fix the amount read in the webhook check (ticket 04). Otherwise every legitimate payment lands `rejected`. | pending |
| 2 | `payment_methods` and `recurring` on order creation are honored | Create a Mensal order restricted to card, open the hosted page, confirm Boleto/Pix are absent and no second charge is scheduled outside the subscription | Mensal could be charged once and Boleto/Pix offered on it; rework session creation (03) | pending |
| 3 | Mensal two-step flow: order, then `POST /v1/subscriptions`; is Pix allowed as its base order? | Run the two calls in order; try a Pix base order | Docs say yes, PLANNING §6 says no; driver stays card-only until this is settled | pending |
| 4 | `POST /payment-links` hosted flow works, and collects CPF/CNPJ for every method | Create a link, pay once with card, Pix and Boleto | Fallback: drive customer, order, payment directly (03, 13) | pending |
| 5 | `customer.document_number` is non-null per payment method through the real flow | After each payment in check 4, refetch the order and read `customer.document_number` | `buyer_document` is NULL and the operator enters it by hand (13) | pending |
| 6 | Mensal: does the subscription refetch carry a customer document? | `GET` the subscription after activation | Ask for CPF/CNPJ on `/conta` after activation (backlog, Mensal fiscal data) | pending |
| 7 | `recusado_por_risco` meaning: refused and never charged, or charged? | Trigger a risk refusal if the sandbox allows it; read the order's charge state | Today it maps to `refunded`, which revokes a Licença and may flag a nota. Remap if the order was never charged (04) | pending |
| 8 | Subscription responses carry no amount | Read a subscription response | Mensal purchases skip the amount check (04); if an amount exists, add the check | pending |
| 9 | Yearly interval: `interval: "year"` accepted | Create a yearly subscription (deferred to 1.0.0, ADR-0006) | Nothing before 1.0.0 | pending |
