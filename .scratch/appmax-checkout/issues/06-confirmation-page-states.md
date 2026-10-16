# 06: Confirmation page states for Pix, Boleto and card

**What to build:** `/checkout/confirmacao` shows what the Cliente needs to pay or wait, per method, resolved server-side on first paint and kept fresh by the existing poll of `/billing/status`.

- **Pix:** the QR image, the `emv_code` with a copy button (clipboard API with a select-all fallback), and `expires_at` as a countdown or plain deadline; after expiry show an expired state with a "Gerar novo Pix" link (a new checkout, never resumes the row, like `pendingTimeoutRetry`). Pix is shown while the purchase is `pending`; on `active` the existing paid state takes over.
- **Boleto:** a link to `pdf_url` (new tab, `rel="noopener"`), the digitable line with a copy button, the due date, and the existing "up to one business day" text; the e-mail with access arrives on confirmation (PLANNING.md §7). Past the due date show an overdue state (`order_billet_overdue` is a hint only; the date decides on the page).
- **Card:** `autorizado` is antifraud review, not payment. Keep the row `pending`; message: payment under analysis, we notify by e-mail and the page updates by itself. The existing 2 s poll and timeout message already exist; reword only if the current text claims otherwise.
- A pure view-model `getPurchaseView(env, reference)` (replacing the read in `status.ts`, which the page and `/billing/status` both use) returns `{state, method, instructions}` where `state` adds `awaiting_pix` and `pix_expired` next to the existing `awaiting_boleto`, and the instructions are parsed and validated from `payment_instructions`. Only an `https:` `pdf_url` and a `data:image/png;base64,` or `https:` QR source are rendered; anything else is dropped. A missing or unparseable instruction degrades to the generic pending message rather than an error page.
- Copy goes in `src/content/checkout-confirmation.ts` (the `confirmationMessages` record is keyed by state, extend its key union in the same file); unverified wording is `launchBlocking`.
- `/billing/status` returns the new states; the page script swaps text and unhides instruction blocks by `data-state` like today. Keep the reload-safe behavior: a refresh shows the same Pix again.

**Blocked by:** 05.

**Status:** done

TDD seam: `getPurchaseView` (pure parsing and state derivation, with an injected `now`) plus the existing `status.test.ts`; page checked in the browser at 390 and 1280 for Pix, Pix expired, Boleto, card in analysis, paid.

- [x] Pix pending shows QR, copyable code and deadline; expired Pix shows the expired state and a new-checkout link
- [x] Boleto pending shows the PDF link, copyable digitable line and due date; the e-mail-on-confirmation note stays
- [x] Card in review shows the analysis message and flips to paid by polling when the webhook lands
- [x] Reloading the page keeps showing the instructions (they come from D1, not from the pay response)
- [x] Untrusted instruction values are validated before rendering (URL scheme, image source)
- [x] `/billing/status` and the page agree on the new states; existing states and the amount-mismatch `rejected` copy are unchanged
- [ ] No inline copy in markup; tokens only; works at 390 and 1280
- [x] Typecheck and the full test suite pass

## Comments

- `getPurchaseView(env, reference, now?)` lives in `modules/billing/status.ts`, on top of a pure `derivePurchaseView(rows, now)`; `getPurchaseStatus` (what `/billing/status` answers) is now a thin wrapper over it, so the page and the endpoint cannot disagree. `findByCheckout` also returns `payment_instructions`.
- New states: `awaiting_pix`, `pix_expired`, `boleto_overdue` (the ticket asks for an overdue state; it got its own key) and `card_in_review` (a pending row whose method is `card`, so the analysis message differs from the generic pending). A pending card or generic pending wait still switches to the timeout copy after 5 minutes.
- Validation: QR source only `data:image/png;base64,` or `https:`; PDF only `https:`; the Pix code and digitable line must be short printable text without markup characters. A Pix with neither QR nor code, or unparseable JSON, falls back to `pending`; a Boleto without instructions keeps the old `awaiting_boleto` text (rows from before the own checkout).
- Times: Appmax's zone-less `expires_at` (`YYYY-MM-DD HH:MM:SS`) and the Boleto `due_date` are read as Brasília time (UTC-3); a Boleto is overdue after its due day ends. Both formats are unverified (08). The deadline is shown as a plain date and time, no countdown.
- "Gerar novo Pix" and the overdue Boleto's "Fazer um novo pedido" link to a new `/checkout` of the same Robô and Oferta (the catalog for a cart), never resuming the row.
- Verified by rendering the built Worker locally against seeded rows: Pix (QR, code, deadline), expired Pix (retry link shown, Pix block hidden), Boleto (PDF in a new tab with `rel="noopener noreferrer"`, line, due date), card review, and a row with a `javascript:` QR and a `<script>` code degrading to the generic pending message; `/billing/status` answers the same states. **Not done:** the visual check at 390 and 1280 px in a real browser (no browser available to the agent); that box stays open.
