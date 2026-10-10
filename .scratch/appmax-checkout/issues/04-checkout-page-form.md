# 04: Checkout page `/checkout?robot=&offer=`: our own form

**What to build:** The page `pages/checkout.astro` renders for the `form` result of 02. Order summary (Robô name, Oferta label, price from the server, never from the URL), buyer fields, payment method choice, card fields, pay button, withdrawal note. Style follows the site (Tailwind v4 with the `--rt-*` tokens only, no raw colors), consistent with `/login` and `/conta` forms; works at 390 and 1280.

- Buyer fields: Nome completo, E-mail, Telefone, CPF ou CNPJ. Address is **not** built: whether Appmax requires it for digital goods is unverified (08). If 08 says it is mandatory, a follow-up ticket adds it.
- Method selector (radio group) limited to the methods the server returned (`paymentMethodsFor(offer)`); Pix first for Anual (PLANNING.md §6 steers Anual to Pix). Selecting a method shows its note: Pix (pay now, code expires), Boleto (confirms in up to one business day, CONTEXT.md), card (analysis may take a few minutes).
- Card fields exactly as Appmax JS expects: a `<form data-appmax-checkout>` and inputs named `card-number`, `card-holder-name`, `exp-month`, `exp-year`, `cvv` (plus `autocomplete` tokens `cc-number`, `cc-name`, `cc-exp-month`, `cc-exp-year`, `cc-csc`, and no `name` collisions with our own buyer fields). Never post these to our server: only the token leaves.
- Script: load Appmax JS from `https://scripts.sandboxappmax.com.br/appmax.min.js` or the production host per `APPMAX_ENV`, call `init({externalId, onTokenize, onError})` **once**, after the form is in the DOM, on every method (it also collects the client IP, ADR-0007); `externalId` from `APPMAX_EXTERNAL_ID`, rendered into the page, never hardcoded. No other third-party script on this page.
- Submit: `preventDefault`, validate with `buyer-input.ts` (03), card → tokenize then `POST /checkout/pay`; Pix and Boleto → `POST /checkout/pay` directly; button disabled while in flight (double-submit guard); field errors inline with `aria-describedby`, a top-level error region for provider errors; success navigates to `redirectUrl`.
- The fresh `reference` from 02 is a hidden field; after a failed card attempt the pay endpoint returns a new one (05).
- `unavailable` (Mensal on Appmax) shows a clear message with a link back to `/catalog`.
- Copy lives in `src/content/checkout-form.ts` (typed, `docs/agents/content-files.md`); `launchBlocking` for anything unapproved: security reassurance such as "seus dados de cartão não passam pelos nossos servidores", the withdrawal note (reuse `withdrawalHref` from `legal.ts`, the wording follows `buyWithdrawalNote`), and any claim about approval times. Reasons cite PLANNING.md §6 and ADR-0007.
- The Privacy and Termos placeholders must list what is collected now (name, CPF/CNPJ, phone, IP); add TODO lines in `src/content/legal.ts` placeholders, real text is a lawyer's (PLANNING.md §9). README's "Hosted checkout" line is corrected here.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

TDD seam: content file shape test (`checkout-form.ts`: every field and error code from 03 has copy, every Oferta has a label, `launchBlocking` wrapped items found by the grep); everything else is verified in the browser.

- [ ] Renders for Compra and Anual with the methods the server returned; Mensal on Appmax shows the unavailable message
- [ ] Card inputs carry the exact names Appmax JS reads; `init` runs once per page load
- [ ] Pix and Boleto submit without waiting on Appmax JS; card submits only after `onTokenize`
- [ ] Inline validation matches `buyer-input.ts` (same function), errors are announced to assistive tech, focus moves to the first error
- [ ] Price and Robô shown come from the server result; tampering with the URL price changes nothing
- [ ] Double click on pay sends one request
- [ ] No inline copy in markup; `launchBlocking` used for unverified claims
- [ ] Tokens only (no raw hex), checked in the browser at 390 and 1280 for card, Pix, Boleto, error and `unavailable` states
- [ ] Privacy/Termos placeholders mention the new data; README corrected
- [ ] Typecheck and the full test suite pass
