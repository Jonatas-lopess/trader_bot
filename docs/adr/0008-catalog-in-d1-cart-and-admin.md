# Catalog in D1, multi-Robô cart, repeat purchases and an admin area

Status: Accepted (2026-10-12), owner decisions after showing the site to the business partner.
Revised the same day: Mensal on standby, "Saiba mais" is a modal, e-mails get a dead letter.
Amended 2026-10-16: the Encomenda covers any custom work, not only a new Robô (below).
Amends [ADR-0006](0006-catalog-pivot.md) in three places (below). Does **not** supersede
[ADR-0003](0003-appmax-como-gateway.md), [ADR-0005](0005-stripe-test-driver.md) or
[ADR-0007](0007-own-checkout-on-appmax.md); the cart rides on the own checkout of ADR-0007.

## Context

ADR-0006 kept the catalog in a typed content file with "no runtime write path" and said:
"Move to D1 only when non-developers need to edit it." The business partner now needs to
add, edit and hide Robôs herself, which is that trigger. The same review asked for a cart,
for buying the same Robô again, and for a custom-Robô request page.

## Decision

**The catalog lives in D1, edited from an admin area.** Tables `robots` and `robot_offers`
replace `src/content/catalog.ts`. Only data moves: copy that is not catalog data (page
headings, button labels, the regulatory note) stays in typed content files
(`docs/agents/content-files.md`). `launchBlocking` no longer applies to catalog values; its
job (keep unapproved copy from going live) becomes the Robô's `draft` status, and a Robô is
public only once the admin publishes it.

- Price integrity is unchanged in kind: the client sends only `robot_id` + `offer`, the price
  is read **from D1 server-side at checkout**, and `purchases.amount_cents` snapshots it. The
  webhook still compares against the stored amount, so an admin editing a price mid-payment
  cannot false-flag a legitimate payment.
- `slug` is immutable once any purchase references it (`purchases.robot_id`, `robots/<slug>/`
  in R2). Robôs are archived, never deleted.
- The binary and source in R2 stay out of the admin (manual upload, as in PLANNING §8).

**Admin access is the existing magic-link session plus an allowlist.** `ADMIN_EMAILS`
(comma-separated, normalized like Cliente emails) names who may enter `/admin/*`. Unset means
nobody (fail closed, the convention of `PAYMENT_PROVIDER` and `APPMAX_WEBHOOK_IPS`). A
non-admin gets a 404, not a 403. No second login system, no roles beyond "admin". State-changing
admin requests check `Origin` against the site origin.

**Multi-Robô cart on a single Appmax order.** Amends "One Robô per checkout. No cart."
The cart holds Compra and Anual lines (card, Pix and Boleto, so one payment method fits every
line). **Mensal is on standby** (below), so the cart never meets a recurring line.

- Cart state is client-side only: a `zustand/vanilla` store persisted to `sessionStorage`
  (survives reload, not a new tab or browser session, which is what the owner asked for). It
  holds `{robot, offer, quantity}` and **never a price**; the cart page asks the server to
  price the lines. Nothing about the cart is stored server-side until pay.
- One Appmax order with one `products[]` entry per line (documented, PLANNING §13). One
  `purchases` row per **Licença** (a quantity of 2 is two rows), so everything keyed on
  `purchase_id` (licenses, download tokens, cancel, withdrawal, NFS-e) is untouched. Rows of one
  checkout share `appmax_order_id` and a new `checkout_id`.
- The webhook's amount check compares Appmax's `amounts.sub_total` with the **sum** of
  `amount_cents` over the rows sharing that order, and the compare-and-swap moves all of them
  together. All-or-nothing: no partial fulfilment.
- Resolves the "Cart / multi-Robô checkout" item of PLANNING §1's out-of-scope list.

**Assinatura and the Mensal Oferta are on standby.** The owner intends to replace the per-Robô
Mensal with one Assinatura that grants access to every Robô; that is a different model (an
entitlement not tied to one Robô, which also reopens the Licença-per-Corretora rule) and is not
designed here. Until it is: the admin offers only Compra and Anual, `robot_offers` does not
accept `monthly`, the catalog UI shows no Mensal row or "Assinar" button, and the Mensal
recurrence ticket of `appmax-checkout` (09) is deferred. Existing subscription code (cancel,
webhook subscription events, the `monthly` value on `purchases`) is left in place, neither
extended nor removed, so the future model can reuse or replace it deliberately.

**Repeat purchases of the same Robô are allowed.** Amends "One active Licença per Cliente per
Robô". A Licença is bound to one Corretora account, so a second Licença of the same Robô is
the way to run it on a second account. The checkout block and the duplicate-Licença operator
alert go away. The rule becomes: **one Licença = one Robô = one Corretora account, and a
Cliente may hold several of the same Robô.** The customer area tells them apart by Corretora
account and purchase date. Amends the "Rental-to-Compra conversion" reasoning too: it no
longer needs a uniqueness rule to be deferred behind.

**Encomenda is a custom-work request, not a purchase** (first a custom-Robô request; widened by
the amendment below). A public form (name, contact, strategy description, market, Corretora)
with no price and no payment. A submission is
stored in D1 first, then sent to the operator by e-mail (Resend) and offered as a prefilled
WhatsApp message (`wa.me` link, opened by the Cliente: a Worker cannot send WhatsApp without
the paid Business API, which is out of scope). Storing first means a failed e-mail does not
lose the lead.

*Amendment (2026-10-16, storefront-v2 17).* The Encomenda is a request for any custom work: a
new Robô not in the Catálogo, an adjustment to a Robô, or something else. Wording only: the
form keeps its fields (the free text, stored in `custom_orders.strategy`, now describes what is
wanted), and the term, routes, module and table keep their names. It is still not a purchase,
and an adjustment is not tied to a Licença: the form does not check that the sender owns the
Robô they name.

**Failed e-mails go to a dead letter.** A small `email_dead_letters` table records an e-mail
whose send failed (recipient, subject, body, attempts, last error, timestamps), written by a
shared helper wrapping the Resend seam. The admin lists them and can resend one; there is no
cron retry in this effort (a Workers cron trigger is a later option). The Encomenda
notification is the first user; the magic-link and download-link sends can adopt it in their
own tickets (their failures are only logged today, `customer-area` 06). Bodies of magic-link
e-mails carry a login secret, so those must not be stored; adoption there needs its own
decision.

## Consequences

- `/catalog` and the landing teaser read D1, so they stop being
  prerendered (or the teaser reads at build time; decided in the ticket). Requests count
  against the 100k/day free quota; one indexed D1 read is well inside the 10 ms CPU budget.
- A new dependency, `zustand` (PLANNING §3). Astro's own recommendation is nanostores; zustand
  was chosen by the owner and its vanilla build needs no UI framework.
- New personal data: Encomenda name, contact and free text. Privacy placeholder gains a TODO
  line (real text is a lawyer's, PLANNING §9).
- The ADR-0006 test fixtures built on `catalog.ts` move to D1 seeding in tests.
- Ordering: the cart tickets build on the own-checkout tickets (`appmax-checkout` 04, 05, 07)
  rather than rewriting the single-item pay endpoint twice. Work is tracked in
  `.scratch/storefront-v2/`.

## Open

- NFS-e: one nota per order or per Licença. Rows carry the data either way; ask the contador.
- Whether the cart caps quantity per line (the tickets assume 5).
- "Saiba mais" is a modal (`<dialog>`) on `/catalog`, not a page, so ADR-0006's "no per-Robô
  detail pages" stands. The long description therefore ships inside the catalog HTML; no
  shareable per-Robô URL and no per-Robô SEO until a page is wanted.
- Which e-mails adopt the dead letter beyond Encomenda (see Decision).
