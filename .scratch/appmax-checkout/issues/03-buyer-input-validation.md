# 03: Buyer input: normalization and validation (pure module)

**What to build:** A pure module `src/modules/billing/buyer-input.ts` that the checkout page script and the pay endpoint both import, so client and server agree. No I/O.

- `normalizeBuyerInput(raw)` → `{ok:true, buyer} | {ok:false, fieldErrors}` where `buyer` is `{firstName, lastName, email, phone, document}`.
- Name: one "Nome completo" trimmed and whitespace-collapsed; first token is `firstName`, the rest `lastName`; a single word is an error (Appmax's customer key uses both).
- E-mail: shape check plus the existing `normalize-email` helper from `modules/identity` (do not fork it); reuse its normalization so the Cliente identity per email (catalog-pivot 14) matches.
- Phone: digits only, Brazilian DDD + 8 or 9 digits (10 or 11 digits, optional leading `55` stripped); the exact format Appmax wants is unverified (08).
- Document: reuse `normalizeBuyerDocument` from `payment-provider.ts` for digits, and add the CPF and CNPJ check-digit validation (the existing function only checks length). Alphanumeric CNPJ (2026) is rejected with a message that points to support, as `normalizeBuyerDocument` already treats it as absent.
- Field-error codes are stable strings; the user-facing copy lives in `src/content/checkout-form.ts` (04), never here.

**Blocked by:** None (can start immediately).

**Status:** done

TDD seam: the whole ticket, test-first, table-driven.

- [x] Valid and invalid CPF (all-equal digits, wrong check digits, wrong length) and CNPJ cases
- [x] Name splitting: "Maria Silva", "Maria de Souza Silva", "Maria", extra spaces, empty
- [x] Phone with and without mask, with `+55`, too short, too long
- [x] E-mail normalization matches `modules/identity`'s for the same inputs
- [x] Returns every field error at once, not just the first
- [x] No personal data in thrown errors or messages
- [x] Typecheck and the full test suite pass
