# 13: Confirmation page and delivery for several Licenças

**What to build:** The post-payment surface for a cart.

- `/checkout/confirmacao?ref=` resolves by `checkout_id` (10): shows the list of Robôs bought, the aggregate state, Pix/Boleto instructions once per checkout, and the "Entrar na área do cliente" step on confirmation. Copy in `content/checkout-confirmation.ts`; the `rejected` ("received, under review") wording from PLANNING §6 covers the whole order.
- `/billing/status` answers for a group by `checkout_id` (aggregation from 10); single purchases unchanged.
- Delivery: each Licença has its own Corretora account and binary, so the download link is minted per Licença once that Licença is `active` (operator-compiled, ADR-0006). Nothing is sent at payment time for a Licença still `awaiting_account`. Check `dispatch.ts` and `activate.ts` for per-purchase assumptions and the email template for a Cliente who gets several links in a row (one e-mail per Licença is fine; do not batch).
- `/conta` already lists one card per Licença (01); confirm N new cards appear together and each asks for its Corretora account.

**Blocked by:** 11, 12, appmax-checkout 06.

**Status:** done

- [x] Cart purchase shows all Robôs and the right aggregate state for card, Pix and Boleto (view-model tested; page checked headless at 390 and 1280 in ticket 15 for Pix, Boleto, card review, active and rejected)
- [x] Each Licença gets its own account entry, compile and download link (per-Licença e-mail tested here; the full chain in ticket 15's `cart-e2e.test.ts`)
- [x] Single-item confirmation unchanged
- [x] Typecheck and the full test suite pass (after merging `main`; see ticket 15 for how the run went)

## Comments

- `/billing/status` and the page already resolved by `checkout_id` (ticket 10, appmax-checkout 06); nothing changed there. `derivePurchaseView` now returns `items` (one entry per Robô and Oferta with its number of Licenças) instead of `line`; Pix and Boleto come from the first pending row, which is the order's since the pay endpoint stores them on every row (ticket 11). Tests cover a 3-row cart pending by Pix, Boleto and card, and active, rejected and refunded.
- The page lists the order ("Seu pedido": Robô name from the catalog, `Oferta · N licenças`, worded by `summary.lineDetail` of `checkout-form.ts`) above the instructions, for single purchases too. Item order follows the rows (`created_at`, then `id`); a cart's rows are inserted in one batch, so their order is stable across reloads but not necessarily the cart's.
- "Gerar novo Pix" / "Fazer um novo pedido" (`newCheckoutHref`) now rebuild a cart's checkout (`/checkout?line=...`) instead of sending a cart to the catalog; a single Licença keeps `/checkout?robot=&offer=`.
- The `rejected` copy (launch-blocked) now speaks of "as Licenças do seu pedido", which covers one or several.
- Delivery: `dispatch.ts`/`activate.ts` were already per Licença (`license_id = purchase_id`) and nothing is sent before a Licença is `active`. The download e-mail now names the Robô (catalog name, slug fallback) in the subject and first line, plus the Corretora account, so a Cliente who receives several links in a row can tell them apart (`downloadLinkEmailFor` in `content/emails.ts`). One e-mail per Licença, not batched.
- `/conta` already lists one card per Licença with its own account form (01); the three-Licença case is asserted in ticket 15's end-to-end test.
- The "Entrar na área do cliente" step is unchanged (still the inert label from checkout-webhooks 05; linking it to `/login` was not asked here).
- The visual check of `/checkout/confirmacao` for a cart at 390 and 1280 px was done headless in ticket 15's run; a real-device check is still the owner's.

