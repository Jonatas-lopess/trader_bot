# 03: Tell the buyer about the 7 days before and after paying

**Blocked by:** —

**Status:** done

**What to build:** the right is only stated in the Termos today. CDC wants the Cliente informed clearly at purchase. Add a short statement, all `launchBlocking`, linking to the Termos clause:

- Catalog cards and the "Comprar" action area (`src/content/catalog-page.ts`): one line near the price. Checkout is hosted by Appmax, so this is the last place we control before payment.
- FAQ (`src/content/faq.ts`): "Posso pedir reembolso?" next to the cancel question, scoped per Oferta (Mensal cancels renewals; the 7 days covers the first charge).
- Paid confirmation (`src/content/checkout-confirmation.ts`): one sentence plus how to request (02).
- Footer "Suporte & Termos": link to the clause.

Not "garantia": that word suggests a product-performance guarantee. The statutory right is *arrependimento*; copy says "7 dias para desistir da compra". Lawyer confirms.

- [x] Line on catalog cards and the buy action, in a content file, `launchBlocking`
- [x] FAQ entry, Oferta-scoped
- [x] Sentence on the paid confirmation
- [x] Each links to the Termos section anchor
- [x] `pnpm test` passes

## Decisions / Notes

- Wireframe has no slot for this (checked 2026-10-05: no mention in `landing-page`, `catalogo-planos`, `painel-cliente`, `estados-licenca`). Slots to add in Figma, if the design should follow: a line in the `catalogo-planos` cards, an FAQ question in `landing-page`, a "Solicitar arrependimento" action in the `painel-cliente` "Central de suporte", a revoked-by-withdrawal state in `estados-licenca`.
- Built: `buyWithdrawalNote` + `cardWithdrawalNote` (catalog-page.ts, under the buy area of every card with offers, none on coming-soon), FAQ "Posso pedir reembolso?" right after the cancel question (faq.ts, new optional `links`), `withdrawalNotice` (checkout-confirmation.ts, shown on the `active` state only, points at the support e-mail until 02 exists), footer link "Direito de arrependimento". All three copy slots are `launchBlocking`; the footer label reuses the Termos heading (plain, not blocked).
- The Termos clause had no anchor. `LegalSection` gained an optional `id`; the clause is `#direito-de-arrependimento` (`withdrawalAnchor`, `withdrawalHref` in legal.ts), rendered by `legal-page.astro`. The `/conta` Termos dialog does not render ids (the links go to the page).
- When 02 lands, swap the support e-mail in `withdrawalNotice` for the `/conta` request link.
