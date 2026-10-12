# storefront-v2

Status: ready-for-agent

Four changes from the owner's review with the business partner (2026-10-12), recorded in
[ADR-0008](../../docs/adr/0008-catalog-in-d1-cart-and-admin.md). That ADR is the source of truth;
this spec turns it into work. Tickets: `issues/01` to `issues/16`, indexed in `TODO.md`.

Governing docs: ADR-0008, ADR-0006 (price integrity, purchase status ranking), ADR-0007 and
`.scratch/appmax-checkout/` (own checkout the cart rides on); PLANNING.md §3, §6, §8;
CONTEXT.md (Robô, Oferta, Compra, Anual, Licença, Cliente, Encomenda, Carrinho);
`docs/agents/content-files.md`.

## Problem Statement

The business partner reviewed the site and found four gaps. The catalog cards are tall carousel
slides, hard to scan, with no way to read more about a Robô or to collect several before paying.
A Cliente who already holds a Robô is refused when they try to buy it again, although a Licença is
bound to one Corretora account and running the same Robô on a second account needs a second
Licença. There is no way to ask for a Robô that is not in the Catálogo. And the Robôs live in a
source file, so adding, pricing or hiding one needs a developer and a deploy: the partner cannot
run the catalog herself.

## Solution

`/catalog` shows slim cards in a responsive grid. Each card has "Saiba mais", which opens a modal
with the full description, details and prices, and "Adicionar ao carrinho". The cart keeps its
lines in the browser for the session; a cart page prices them from the server and the Cliente pays
for all of them in one checkout, receiving one Licença per unit. Buying a Robô already held is
allowed. `/encomenda` takes a custom-Robô request, stores it, e-mails the operator and offers a
prefilled WhatsApp message; a failed e-mail is parked in a dead letter the admin can resend.
`/admin` lets listed admins create, edit, publish and archive Robôs and their prices. The Mensal
Oferta and any Assinatura work are on standby while the owner designs one Assinatura that grants
access to every Robô.

## User Stories

1. As a visitor, I want to see the Robôs in a compact grid, so that I can compare many at a glance
2. As a visitor on a phone, I want the grid to collapse to one column, so that cards stay readable
3. As a visitor, I want each card to show the Robô's name, a short description and its main price, so that I can shortlist quickly
4. As a visitor, I want a "Saiba mais" button on each card, so that I can read about a Robô before deciding
5. As a visitor, I want "Saiba mais" to open a modal over the catalog, so that I do not lose my place in the grid
6. As a visitor, I want to close the modal with Esc, the backdrop or a close button, so that dismissing it is effortless
7. As a keyboard or screen-reader user, I want focus to move into the modal and return to the button on close, so that the modal is usable without a mouse
8. As a visitor, I want the modal to show the long description, Estratégia, Mercado, Perfil and the Compra and Anual prices, so that I have what I need to choose
9. As a visitor, I want to buy a single Oferta straight from the modal, so that I can skip the cart when I want just one
10. As a visitor, I want a coming-soon Robô to open a modal without prices or buy buttons, so that I am not offered something I cannot buy
11. As a visitor, I want to add a Robô to a cart from its card, so that I can keep browsing before paying
12. As a visitor, I want to add a Robô to the cart from the modal, so that I can decide after reading
13. As a visitor, I want the header to show a cart icon with the number of items, so that I always know what is in my cart
14. As a visitor, I want the cart to survive a page reload in the same tab, so that a refresh does not empty it
15. As a visitor, I want the cart to be empty in a new browser session, so that nothing lingers on a shared device
16. As a visitor, I want a cart page listing each line with name, Oferta, quantity and price, so that I can review my order
17. As a visitor, I want to change quantities and remove lines, so that I can correct my selection
18. As a visitor, I want to see the order total, so that I know what I will pay
19. As a visitor, I want a line that was unpublished or repriced while in my cart to be flagged, so that I am not surprised at checkout
20. As a visitor, I want an empty-cart state with a link back to the catalog, so that I am not stranded
21. As a visitor, I want to add the same Robô twice, so that I can run it on two Corretora accounts
22. As a Cliente, I want to buy a Robô I already hold, so that I can license it for another Corretora account
23. As a Cliente with two Licenças of the same Robô, I want each shown separately with its Corretora account and purchase date, so that I can tell them apart
24. As a Cliente, I want to enter a Corretora account for each Licença separately, so that each binary is built for the right account
25. As a buyer, I want to pay for the whole cart in one checkout, so that I do one payment instead of several
26. As a buyer, I want to choose card, Pix or Boleto for the whole order, so that I pay my usual way
27. As a buyer, I want the price I am charged to come from the server, not the page, so that I am charged the real price
28. As a buyer, I want my cart cleared only after payment is accepted, so that a failure does not lose my selection
29. As a buyer, I want one confirmation page listing everything I bought, so that I know the order is complete
30. As a buyer paying by Boleto or Pix, I want the confirmation to explain what happens next for the whole order, so that I am not confused by a long wait
31. As a Cliente, I want one login and one set of Licenças after a multi-item order, so that my account is not fragmented
32. As a Cliente, I want a download link per Licença once it is ready, so that each Robô arrives when its binary is compiled
33. As a buyer, I want a payment that does not match the order total to be held for review rather than silently accepted, so that errors are caught
34. As a Cliente, I want a refund or chargeback of the order to revoke every Licença in it, so that the state is consistent
35. As a visitor, I want an Encomenda page, so that I can ask for a Robô that does not exist yet
36. As a visitor, I want to describe my strategy, market and Corretora in the form, so that the team understands the request
37. As a visitor, I want to leave an e-mail, a phone or both, so that the team can reach me the way I prefer
38. As a visitor, I want clear validation errors that keep what I typed, so that I do not retype the form
39. As a visitor, I want a confirmation after sending, so that I know the request was received
40. As a visitor, I want a button that opens WhatsApp with my request prefilled, so that I can talk to the team faster
41. As a visitor, I want the form to work even if the team's e-mail is down, so that my request is not lost
42. As an operator, I want every Encomenda stored and e-mailed to me with the requester's address as reply-to, so that I can answer directly
43. As an operator, I want a failed Encomenda e-mail parked in a dead letter, so that no lead is lost to a transient failure
44. As an admin, I want to list unresolved dead-letter e-mails with the error and age, so that I can see what failed
45. As an admin, I want to resend a parked e-mail with one click, so that I can recover without a developer
46. As an admin, I want the count of unresolved dead letters on the admin home, so that I notice problems
47. As an admin, I want to log in with the same magic link as Clientes, so that there is no second login system
48. As an admin, I want admin access limited to a configured list of e-mails, so that Clientes and strangers cannot edit the catalog
49. As an operator, I want the admin area to be invisible to non-admins, so that its existence is not advertised
50. As an operator, I want an unset admin list to lock everyone out, so that a missing setting cannot open the area
51. As an admin, I want to list all Robôs with their status, so that I can see the whole catalog including drafts
52. As an admin, I want to create a Robô with name, slug, descriptions, strategy, market, Perfil, Corretoras and status, so that I can add products without a developer
53. As an admin, I want to set Compra and Anual prices in reais, so that I do not convert to cents
54. As an admin, I want new Robôs to start as drafts that only I can see, so that I can prepare them before launch
55. As an admin, I want to publish, unpublish and mark a Robô coming-soon, so that I control what is on sale
56. As an admin, I want to archive a Robô instead of deleting it, so that past purchases and binaries keep their reference
57. As an admin, I want the slug locked once a Robô has been bought, so that I cannot orphan purchases and stored binaries
58. As an admin, I want a price change to apply to new checkouts only, so that payments already in flight are not false-flagged
59. As an admin, I want invalid input rejected with field errors, so that I cannot publish a Robô with a broken price or no Oferta
60. As an admin, I want to preview a draft as it will look on the catalog, so that I can check it before publishing
61. As the owner, I want Mensal and Assinatura to stay out of the catalog and admin for now, so that the future all-Robôs Assinatura is not boxed in by a per-Robô one
62. As the owner, I want placeholder Robôs available only as a local dev seed, so that they can never reach production
63. As a developer, I want cart state to hold no prices, so that a tampered browser cannot change what is charged

## Implementation Decisions

- **Catalog module (new).** The catalog moves to two D1 tables, robots and robot offers, behind one module that is the only code aware of the schema. Read side: published listing in sort order, published lookup by slug, and a price lookup that keeps today's discriminated-union result (found with cents, or a reason) but is async and treats draft and archived as not found. Write side: create, update, status transitions and archive, with all validation server-side. Offers are Compra and Anual only; the offers table does not accept monthly.
- **Robô shape.** Mirrors the current catalog type (name, short description, strategy type, market list, Perfil, supported Corretoras, status, sort order) plus a long description used by the modal. Status is draft, available, coming-soon or archived. Slug is kebab-case, unique, and immutable once any purchase references it. Robôs are never hard-deleted.
- **Price integrity unchanged in kind.** The client sends only robot and offer; the price is read from D1 at checkout and snapshotted on the purchase; the webhook compares against the snapshot, never the live catalog.
- **Catalog content file removed.** Copy that is not catalog data (headings, labels, regulatory note) stays in typed content files. Launch-blocking marking of catalog values is replaced by the draft status. The catalog page and the landing teaser read D1; whether the landing stays prerendered is decided in the consumer-switch ticket.
- **Dev seed.** Placeholder Robôs load through a script for local development only, never a migration.
- **Saiba mais is a modal.** One native dialog on the catalog page, filled from per-card content already in the HTML, no extra route and no fetch. Reuses the existing dialog pattern and the card's price and info building blocks. ADR-0006's "no detail pages" stands.
- **Card grid.** Replaces the carousel entirely. Cards carry name, short description, main price, and two actions. The details block and selectable price rows move into the modal. This departs from the 1:1 Figma card; owner-approved.
- **Cart store.** A single browser-side module wrapping a zustand vanilla store persisted to sessionStorage with a versioned key. State is lines of robot, offer (Compra or Anual) and quantity (cap 5); never a price or a name. Malformed persisted data is discarded, not fatal. Storage is injectable. Nothing about the cart is stored server-side before payment. The header cart count hydrates client-side.
- **Cart pricing endpoint and page.** A public endpoint validates the lines, prices them from D1 and returns per-line availability and a total; unavailable lines carry no price. A pure pricing function sits behind it and is reused by checkout. The cart page renders from that response. Rate limited like other public endpoints.
- **Multi-line purchases.** One Appmax order with one product entry per line; one purchases row per Licença (quantity N inserts N rows). Rows of one checkout share a new checkout identifier and the Appmax order id. Existing rows backfill with their own id as checkout id. A pure function aggregates row statuses into one checkout status using ADR-0006's ranking, used by the status endpoint and the confirmation page.
- **Pay for a cart.** Extends the own-checkout pay use case: price all lines, insert every row pending before calling Appmax, write the order id on every row before the payment call, one payment for the order, idempotent on retry of the same reference. Payment methods are card, Pix and Boleto. Buyer data is copied to every row. Cart cleared only after a successful pay response. Any line with another offer is rejected.
- **Webhook over an order group.** Amount check compares the gateway's sub_total with the sum of the rows' stored amounts; mismatch rejects all rows with one Sentry report. The compare-and-swap stays one statement and moves every row. On activation: one Cliente provisioned and one login link, one Licença per row. Refund, chargeback and cancel apply to the whole order. Per-Licença partial refunds stay manual.
- **Repeat purchases.** The checkout block and the duplicate-Licença operator report are removed. The customer area distinguishes same-Robô Licenças by Corretora account and purchase date. CONTEXT and ADR-0006 are amended (done).
- **Delivery.** Download links remain per Licença, minted when that Licença is active; nothing is sent at payment time for a Licença still awaiting its Corretora account.
- **Admin gate.** A helper layered on the existing session: the session's normalized e-mail must be in an admin allowlist setting (comma-separated). Unset means nobody. Every non-admin result renders as 404. State-changing admin requests verify the Origin header. An allowlisted address with no purchases must be able to obtain a login link without creating a Cliente-facing artifact.
- **Admin CRUD.** List, create, edit with redirect-after-post and flash messages, validation errors re-rendering with the typed values. Prices entered in reais, stored in cents. An available Robô needs at least one Oferta. Admins see drafts on the real catalog, marked, as the preview.
- **Encomenda.** A prerendered page and a POST endpoint. Fields: name, e-mail and/or phone (at least one), strategy description, market, Corretora, contact consent. Honeypot and per-IP rate limit. The request is stored first, then e-mailed to the operator address setting with the requester as reply-to; user text is escaped and never used to build headers. The success state offers a wa.me link with a prefilled, length-limited message; the WhatsApp number is a setting. Stored data is personal data: the privacy placeholder gets a TODO.
- **E-mail dead letter.** A shared helper wraps the Resend seam: success inserts nothing, failure parks recipient, subject, body, attempts and the provider's reason in a dead-letter table; a park failure is reported to Sentry and never thrown into the caller. A resend operation resolves or increments attempts and is safe against double clicks. An admin page lists and resends. E-mails whose bodies carry secrets (magic link, download link) are not stored; adopting the dead letter for them is a separate decision. No cron retry.
- **Standby.** Mensal and Assinatura are removed from the catalog UI, admin and offer table. Existing subscription code is left untouched. The Mensal recurrence ticket of the own-checkout effort is deferred.
- **Configuration.** New settings: admin allowlist, operator notification address, WhatsApp number. Unset notification address still stores the lead and logs. Types regenerated.
- **Dependency.** zustand is added; only the cart module imports it.

## Testing Decisions

- **What makes a good test.** Exercise external behavior through a use case's public function and assert on D1 rows, returned unions and outbound requests, not on internals or call order. Mock only outbound fetch (Appmax, Resend); D1 is real. A test that passes after a refactor that preserves behavior is the target.
- **Primary seam (existing, preferred).** Use cases with D1 real under vitest-pool-workers and outbound fetch mocked: price lookup and admin catalog operations, pay for a cart, webhook over an order group, the checkout status aggregation, Encomenda submission, the dead-letter send and resend, the admin gate. Confirmed by the owner.
- **Two cheap pure seams.** The cart pricing function and the cart store with injected storage (add, merge, cap, remove, clear, corrupt data, unknown offer dropped).
- **Not unit-tested.** Pages and client scripts are verified in the browser at 390 and 1280; content files get shape tests like the existing catalog and checkout-confirmation ones. No route-level HTTP tests (the repo has none).
- **Prior art.** The catalog end-to-end test, the billing end-to-end and webhook tests, the checkout and buyer-input tests, the schema tests, the identity session tests.
- **Ported, not deleted.** Tests built on the catalog content file move to D1 seeding through a shared test helper; tests asserting the duplicate-Licença block or alert become tests asserting a second purchase succeeds.
- **Final verification.** One end-to-end pass: admin publishes a Robô, a cart with repeat units is paid, the webhook activates, one Cliente holds the Licenças, a forced Encomenda send failure is resent from the admin.

## Out of Scope

- Mensal, Assinatura and the future all-Robôs Assinatura (standby, ADR-0008).
- Server-side carts, coupons, installments, wishlists.
- Uploading Robô binaries or source, or images, in the admin; multiple admin roles; an audit log.
- A per-Robô URL, per-Robô SEO or a shareable detail page.
- Sending WhatsApp from the Worker (Business API); cron-based dead-letter retry.
- Dead-lettering magic-link or download-link e-mails.
- Automatic NFS-e; partial refund tooling.
- Reconciling orders whose webhook was lost (carried by the own-checkout effort).

## Further Notes

- Ordering: tickets 01, 02 and 04 are independent and can start now. Tickets 11 to 13 build on the own-checkout tickets (appmax-checkout 04 to 07) rather than rewriting the single-item pay endpoint twice, so schedule them after those.
- Open with the owner: real WhatsApp number, operator e-mail and Encomenda copy (all launch-blocking placeholders); whether the contador wants one NFS-e per order or per Licença; the quantity cap of 5.
- The landing teaser's data source (prerender versus SSR) is a decision inside the consumer-switch ticket.
- When the all-Robôs Assinatura is designed it will reopen the one-Licença-per-Corretora-account rule; this spec deliberately does not pre-empt it.
