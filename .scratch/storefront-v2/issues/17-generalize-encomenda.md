# 17: Generalize the Encomenda beyond new Robôs

**What to build:** `/encomenda` stops presenting itself as "order a custom Robô" only. A Cliente or visitor can use it to ask for anything the operator can build or change: a new Robô, an adjustment to a Robô they already run, or another custom piece of work. It stays what ADR-0008 made it: a form with no price and no payment, answered by the operator, never a Compra, Licença or Cliente.

Text and domain language only. No new field, no schema change: the `custom_orders` columns (including `strategy`) keep their names, and the form keeps its fields.

- Reword the page: title, description, heading, intro (say plainly that new Robôs, adjustments to an existing one and other requests are all welcome), the main free-text field's label and hint (a description of what is wanted, not only a strategy: for an adjustment, which Robô and what to change), the optional Mercado and Corretora hints (still optional, and not only for new Robôs), consent line, success message, the no-JS result page, and the validation message for the main field. Keep copy in `src/content/encomenda.ts` and keep the `launchBlocking` markers on everything not owner-approved (`docs/agents/content-files.md`).
- Reword what the operator and the visitor receive: the operator e-mail (fixed subject and body intro no longer say "de Robô"; labels follow the new field wording) and the prefilled WhatsApp summary. The e-mail keeps its safety properties (plain text, only validated values in the subject, no header injection).
- Header and footer link text and the nav label stay "Encomenda"; check that nothing else (metadata, landing mentions, `content/legal.ts` privacy TODO that lists "descrição da estratégia") still says the form is only for Robôs, and fix the wording.
- Domain docs: redefine **Encomenda** in `CONTEXT.md` ("a request for custom work: a new Robô not in the Catálogo, an adjustment to a Robô, or something else; no price, no payment, answered by the operator; never a Compra, Licença or Cliente"), record the widening as a short amendment to ADR-0008's Encomenda paragraph, and update the matching lines in `PLANNING.md` (§1 scope line, §4 module description, §11 configuration note) so no document still calls it a custom-Robô request only. Do not rename the term, the routes, the module or the table.
- An adjustment is still not a purchase and still not tied to a Licença: the form does not check that the sender owns the Robô they name. Say so in the ticket's Comments as a known limit, not a feature.

**Blocked by:** None (can start immediately). Ticket 14 is done and is the code this amends.

**Status:** done

TDD seam: `modules/orders/encomenda.ts`, in `modules/orders/encomenda.test.ts`. The page is checked in the browser. Write the test changes first (red), then the copy.

Tests to update or add (checked against the current suite; `encomenda-request.test.ts` and `identity/send-with-dead-letter.test.ts` need no change: the first covers body parsing and the result URL, the second uses generic fixtures):

- **Stop pinning copy.** "stores the lead, e-mails the operator with reply-to, and returns the WhatsApp link" asserts the subject as the literal `` `Nova Encomenda de Robô ${id}` ``. That is the one hard-coded wording the new text breaks. Build the expectation from `operatorEmail.subjectPrefix` in `content/encomenda.ts` instead, and keep asserting the shape that matters: fixed prefix, one space, the first 8 characters of the lead id, nothing from user input.
- **Adjustment request goes through.** Add a case with an adjustment-style main text (names an existing Robô and what to change, no strategy wording) and `market` / `corretora` blank: it normalizes, is stored with `market` and `corretora` as `''`, and the operator e-mail and WhatsApp text contain the text and omit the blank optional lines. This is the behaviour the ticket promises, and nothing covers it today (every fixture describes a new strategy).
- **Operator e-mail labels.** Assert the body uses the labels from `operatorEmail.labels` (import them, do not retype them), so a later reword does not need another test edit. Assert the main text is still indented line by line so none of its lines can start a header-looking line.
- **WhatsApp summary.** Assert the decoded `text=` contains the intro and name from `whatsappSummary` (imported) and the main text; blank optional lines are left out. Keep the existing truncation and "no usable number" cases as they are.
- **Keep unchanged:** field-error codes (`strategy_invalid` etc. are internal codes, not copy), honeypot, per-IP rate limit, header-injection attempt in name and e-mail, stored-when-send-fails and parked-when-send-fails, unset `ORDER_NOTIFY_EMAIL`. If the message for `strategy_invalid` changes, no test changes: tests assert codes.
- Lengths (10 to 2,000 characters for the main text) are unchanged, so the boundary cases stay; if the owner-approved wording changes the limits, that is a new decision, not this ticket.

- [x] The page no longer says the request must be for a new Robô; an adjustment request reads as a normal use of the form
- [x] The main field's label, hint and error message describe "what you want" rather than "your strategy" only
- [x] Operator e-mail and WhatsApp summary use the new wording; the e-mail is still plain text with a fixed subject plus the lead id
- [x] Tests no longer hard-code the old subject or labels (they import them from `content/encomenda.ts`) and include an adjustment-style submission that is stored, e-mailed and summarized for WhatsApp
- [x] Submitting works exactly as before (stored first, e-mail parked on failure, honeypot and rate limit unchanged); `custom_orders` and the endpoints are untouched
- [x] No-JS result page and success state use the new wording
- [x] `CONTEXT.md`, ADR-0008 and `PLANNING.md` agree on the wider definition; nothing still calls the Encomenda a custom-Robô request only; the privacy TODO line names the data in the new terms
- [x] New or changed unapproved copy is wrapped in `launchBlocking`
- [ ] Looks right at 390 and 1280 px; errors announced and focus managed as before
- [x] Typecheck and the full test suite pass

## Comments

Decisions (implementation: `src/content/encomenda.ts`, `src/modules/orders/encomenda.ts`, `src/modules/orders/encomenda.test.ts`, `src/pages/encomenda.astro`, `src/pages/encomenda/resultado.astro`, `src/content/legal.ts`, `CONTEXT.md`, ADR-0008, `PLANNING.md`).

- **Known limit, not a feature.** An adjustment request is not tied to a Licença: the form does not check that the sender owns the Robô they name, and nothing downstream does either. The operator sees only the free text.
- **Copy.** Page title, description, heading, intro, the main field's label, hint and error (`strategy_invalid`), the Mercado and Corretora hints, the consent line, the success message and the WhatsApp intro are new and wrapped in `launchBlocking` (one shared reason citing this ticket). Wrapped strings that sit inside existing shapes (`fields`, `fieldErrors`) are unwrapped with `.value` inside the content file, as `conta.ts` does, so their consumers did not change; `pageTitle`, `pageDescription`, `heading` and `whatsappSummary.intro` are now wrappers and their consumers read `.value`. The operator e-mail is read only by the operator and stays unwrapped, as in 14. Success heading, result-page title and error heading already said "encomenda" without "de Robô" and were kept. Field keys, error codes and the `custom_orders` columns are unchanged.
- **Blank optional fields in the operator e-mail.** Read "omit the blank optional lines" as the WhatsApp behaviour (unchanged): the operator e-mail still prints the Mercado and Corretora lines with `(em branco)`, as in 14, since this ticket is wording only. The adjustment test pins that.
- **Tests.** Subject expectations (including the header-injection case) are built from `operatorEmail.subjectPrefix`; new cases cover the e-mail labels and line-by-line indentation, the WhatsApp summary, and an adjustment request with blank optional fields. Red came from `whatsappSummary.intro` becoming a `launchBlocking` value; the rest are characterization tests that the reword would have broken had they kept the literals.
- **Seen in a browser.** The built `/encomenda` page was screenshotted with headless Chromium at 390 and 1280 px and reads correctly. Markup and the form script are unchanged, so error announcement and focus handling are as in 14; they were not re-driven interactively, so the box stays unticked for the manual pass 14 also left open.
- **Not changed.** `.scratch/storefront-v2/spec.md` story 35 and ADR-0008's Context still say "custom-Robô request": both record what was asked at the time, and the ADR now carries the amendment.
