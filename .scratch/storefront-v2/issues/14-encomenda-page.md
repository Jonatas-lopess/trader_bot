# 14: Encomenda page: custom-Robô request

**What to build:** `/encomenda` (prerendered page, one script) and `POST /encomenda`, with `modules/orders/encomenda.ts`.

- Fields: Nome, E-mail, Telefone/WhatsApp (optional if e-mail given; at least one contact required), Descrição da estratégia (required, length-limited), Mercado, Corretora, a consent line for contact (LGPD). Reuse `buyer-input.ts` normalization for e-mail and phone. No price, no payment, no account creation.
- Server: validate, rate-limit per IP (same Rate Limiting binding approach as the webhook), honeypot field, then **INSERT into `custom_orders`** (new migration: id, name, email, phone, strategy, market, corretora, created_at, `notified_at`), then send the operator e-mail through the dead-letter helper of 16 around the existing Resend seam (`modules/identity/resend-client.ts`; check it can send an arbitrary message and that there are not two copies, `licensing/resend-client.ts` looks like a sibling: consolidate only if trivial) to `ORDER_NOTIFY_EMAIL` with `reply-to` the requester. A failed send lands in the dead letter (16) and is logged to Sentry, **never** surfaced as a failed submission since the lead is stored. `custom_orders` keeps `notified_at` only; error detail lives in the dead letter.
- Success state: confirmation text plus a "Continuar no WhatsApp" link `https://wa.me/<WHATSAPP_NUMBER>?text=<prefilled summary>` (URL-encoded, truncated to a safe length). No WhatsApp send from the Worker. Number and copy are `launchBlocking` placeholders until the owner supplies them.
- Header and footer links to `/encomenda` (`content/header.ts`, `footer.ts`).
- Copy in `src/content/encomenda.ts`. Privacy placeholder gets a TODO line for this data (`src/content/legal.ts`). Config: `ORDER_NOTIFY_EMAIL`, `WHATSAPP_NUMBER` in `.dev.vars.example` / `wrangler.jsonc`, types regenerated. Unset `ORDER_NOTIFY_EMAIL` still stores the lead and logs.
- E-mail body is plain, escapes user text, and carries nothing that could be used for header injection (names/subjects built from validated values only).

**Blocked by:** 16.

**Status:** ready-for-agent

TDD seam: `encomenda.ts` validation (pure), persistence + notify with Resend `fetch` mocked: stored when send fails, honeypot, rate limit, header-injection attempt.

- [ ] Valid submission is stored, e-mailed with reply-to, and shows the WhatsApp link
- [ ] Resend failure still shows success and the e-mail sits in the dead letter
- [ ] Spam (honeypot, over-limit) is dropped without a stored row or with a generic response
- [ ] Looks right at 390 and 1280; errors announced and focus managed
- [ ] Typecheck and the full test suite pass
