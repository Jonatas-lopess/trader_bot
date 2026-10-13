# 14: Encomenda page: custom-Robô request

**What to build:** `/encomenda` (prerendered page, one script) and `POST /encomenda/enviar` (Astro cannot put a page and an endpoint on one route; see Comments), with `modules/orders/encomenda.ts`.

- Fields: Nome, E-mail, Telefone/WhatsApp (optional if e-mail given; at least one contact required), Descrição da estratégia (required, length-limited), Mercado, Corretora, a consent line for contact (LGPD). Reuse `buyer-input.ts` normalization for e-mail and phone. No price, no payment, no account creation.
- Server: validate, rate-limit per IP (same Rate Limiting binding approach as the webhook), honeypot field, then **INSERT into `custom_orders`** (new migration: id, name, email, phone, strategy, market, corretora, created_at, `notified_at`), then send the operator e-mail through the dead-letter helper of 16 around the existing Resend seam (`modules/identity/resend-client.ts`; check it can send an arbitrary message and that there are not two copies, `licensing/resend-client.ts` looks like a sibling: consolidate only if trivial) to `ORDER_NOTIFY_EMAIL` with `reply-to` the requester. A failed send lands in the dead letter (16) and is logged to Sentry, **never** surfaced as a failed submission since the lead is stored. `custom_orders` keeps `notified_at` only; error detail lives in the dead letter.
- Success state: confirmation text plus a "Continuar no WhatsApp" link `https://wa.me/<WHATSAPP_NUMBER>?text=<prefilled summary>` (URL-encoded, truncated to a safe length). No WhatsApp send from the Worker. Number and copy are `launchBlocking` placeholders until the owner supplies them.
- Header and footer links to `/encomenda` (`content/header.ts`, `footer.ts`).
- Copy in `src/content/encomenda.ts`. Privacy placeholder gets a TODO line for this data (`src/content/legal.ts`). Config: `ORDER_NOTIFY_EMAIL`, `WHATSAPP_NUMBER` in `.dev.vars.example` / `wrangler.jsonc`, types regenerated. Unset `ORDER_NOTIFY_EMAIL` still stores the lead and logs.
- E-mail body is plain, escapes user text, and carries nothing that could be used for header injection (names/subjects built from validated values only).

**Blocked by:** 16.

**Status:** done

TDD seam: `encomenda.ts` validation (pure), persistence + notify with Resend `fetch` mocked: stored when send fails, honeypot, rate limit, header-injection attempt.

- [x] Valid submission is stored, e-mailed with reply-to, and shows the WhatsApp link
- [x] Resend failure still shows success and the e-mail sits in the dead letter
- [x] Spam (honeypot, over-limit) is dropped without a stored row or with a generic response
- [ ] Looks right at 390 and 1280; errors announced and focus managed
- [x] Typecheck and the full test suite pass

## Comments

Decisions (implementation: `src/modules/orders/encomenda.ts`, `src/pages/encomenda.astro`, `src/pages/encomenda/enviar.ts`, `src/content/encomenda.ts`, `migrations/0015_custom_orders.sql`).

- **Endpoint path.** A prerendered `encomenda.astro` and an `encomenda.ts` endpoint collide ("a static route cannot be defined more than once"; a hard error in later Astro versions), so the form posts JSON to `POST /encomenda/enviar`. The answer is always JSON: 200 `{ ok, whatsappHref }`, 422 `{ fieldErrors }`, 429, 500, 413/400 for oversize or unparsable bodies.
- **Order of gates in `submitEncomenda`.** Honeypot (field `website`, answers like a success with a generic WhatsApp link, no row, no e-mail, no rate-limit hit), then validation (a typo does not spend a hit), then the per-IP limit (`ENCOMENDA_RATE_LIMITER`, 3 per 60 s, key `ip:<address>`, namespace id 4), then INSERT, then notify. A failed INSERT answers 500 (the lead is not stored, so it is the one failure shown); a failed or skipped e-mail never is.
- **Fields.** Name (2-100), e-mail and/or phone (at least one; phone via the shared `parsePhone`, e-mail via `parseEmail`, both now exported from `modules/billing/buyer-input.ts`, plus a header-safe character check since the address becomes `reply_to`), strategy (10-2,000, line breaks kept), Mercado and Corretora optional free text (up to 100, stored as `''`), consent required. Control and bidi characters are stripped; single-line fields collapse line breaks.
- **E-mail.** Subject is a fixed string plus the first 8 characters of the lead id; body is plain text (`text` only) with the strategy indented line by line. Reply-to is the validated e-mail, absent when only a phone was given. `kind: 'encomenda'`, `storeBody: true`. A parked or lost send is reported to Sentry without lead content; `notified_at` is set only on success. Unset or invalid `ORDER_NOTIFY_EMAIL` stores the lead and `console.warn`s.
- **WhatsApp.** `WHATSAPP_NUMBER` (digits, country code first) overrides the `launchBlocking` placeholder in `content/encomenda.ts`; a set but unusable value yields no link. The prefilled text is cut by code point until the encoded `text=` fits 1,500 characters.
- **Not verified in a browser.** The 390 / 1280 layout and the focus/announcement behaviour of the script were not seen in a browser (the dev server did not start in the agent sandbox). The page builds and prerenders; the visual acceptance item stays unticked for a manual pass.
