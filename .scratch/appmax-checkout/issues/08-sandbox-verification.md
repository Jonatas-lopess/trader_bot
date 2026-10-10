# 08: Sandbox verification with real Appmax credentials

**What to build:** A human run of the whole own-checkout flow against Appmax's sandbox, closing every "read from docs, not sandbox-verified" item. Needs the Appmax account and sandbox app (`client_id`, `client_secret`, the app's `external_id`); PLANNING.md §12 says account creation is currently blocked, so this waits on that external step. It gates go-live only; tickets 01 to 07 do not wait for it (project memory).

Setup:

- Set `APPMAX_CLIENT_ID`, `APPMAX_CLIENT_SECRET` (secrets), `APPMAX_ENV=sandbox`, `APPMAX_EXTERNAL_ID` (the sandbox installation's id; the production one differs and a wrong one answers 404 "Merchant not found"). Run with `PAYMENT_PROVIDER` unset.
- Register our `/billing/webhook` URL in the Appmax app and grant the permissions for the events it must deliver (an event is only sent if the app has its permission). Webhooks need a public URL: use the `workers.dev` test deploy.
- Test cards from the docs: `4000000000000010` succeeds, `4000000000000028` fails with "Payment not authorized".

Verify, recording each result in `docs/ops/appmax-sandbox-checks.md` and PLANNING.md §13 (replace the "not verified" wording with the result), and fix the named code when wrong:

- Card success reaches `autorizado` then `aprovado`/`integrado` via webhook; card failure returns the decline and a retry works with a fresh `reference`.
- Pix: `qr_code` format (base64 or URL), `emv_code`, `expires_at`, `order_paid_by_pix` and how to simulate payment in the sandbox; `order_pix_expired`.
- Boleto: `pdf_url`, `digitable_line`, `due_date`, `order_paid`.
- `customers`: which fields are really mandatory, whether address is required for digital goods (then open a ticket to add it to 04), the accepted phone format, the product `type` enum on orders, whether `ip` from `CF-Connecting-IP` is accepted and whether Appmax cross-checks it with the JS-collected one, whether the card holder document may differ from the buyer's.
- `GET /v1/orders/{id}`: `amounts.sub_total` equals `unit_value` in cents (otherwise every legitimate payment lands `rejected`), `customer.document_number` non-null per method, payment method field.
- Webhook payloads: real `data` field names for the order id (read from `webhook_deliveries`), and whether `external_key` carries anything usable; update `parseWebhookPayload`.
- `recusado_por_risco` meaning (07's open decision).
- Appmax JS: `init` behavior with Pix/Boleto selected, in our `preventDefault` submit; script host for production.
- Whether the sandbox lets us read a source IP for webhooks (feeds the `APPMAX_WEBHOOK_IPS` owner decision).

Rows 2, 4 and 5 of `docs/ops/appmax-sandbox-checks.md` describe the hosted flow and are rewritten to these checks.

**Blocked by:** 04, 05, 06, 07 (and the external Appmax sandbox account).

**Status:** ready-for-human

- [ ] Sandbox credentials and `APPMAX_EXTERNAL_ID` configured; webhook URL registered with the needed permissions
- [ ] Card success, card failure, Pix and Boleto each exercised end to end on the test deploy, purchase reaches `active` through the webhook for card and Pix, Boleto reaches `pending` with its instructions
- [ ] Every item above has a recorded result in `docs/ops/appmax-sandbox-checks.md` and PLANNING.md §13
- [ ] Each wrong assumption has a fix or a follow-up ticket (address, phone format, `qr_code` format, webhook field names)
- [ ] Owner decisions captured: webhook IP filter, Turnstile on the pay route
