# 13: Confirmation page and delivery for several Licenças

**What to build:** The post-payment surface for a cart.

- `/checkout/confirmacao?ref=` resolves by `checkout_id` (10): shows the list of Robôs bought, the aggregate state, Pix/Boleto instructions once per checkout, and the "Entrar na área do cliente" step on confirmation. Copy in `content/checkout-confirmation.ts`; the `rejected` ("received, under review") wording from PLANNING §6 covers the whole order.
- `/billing/status` answers for a group by `checkout_id` (aggregation from 10); single purchases unchanged.
- Delivery: each Licença has its own Corretora account and binary, so the download link is minted per Licença once that Licença is `active` (operator-compiled, ADR-0006). Nothing is sent at payment time for a Licença still `awaiting_account`. Check `dispatch.ts` and `activate.ts` for per-purchase assumptions and the email template for a Cliente who gets several links in a row (one e-mail per Licença is fine; do not batch).
- `/conta` already lists one card per Licença (01); confirm N new cards appear together and each asks for its Corretora account.

**Blocked by:** 11, 12, appmax-checkout 06.

**Status:** ready-for-agent

- [ ] Cart purchase shows all Robôs and the right aggregate state for card, Pix and Boleto
- [ ] Each Licença gets its own account entry, compile and download link
- [ ] Single-item confirmation unchanged
- [ ] Typecheck and the full test suite pass
