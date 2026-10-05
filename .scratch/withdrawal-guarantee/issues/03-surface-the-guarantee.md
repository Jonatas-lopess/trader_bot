# 03: Tell the buyer about the 7 days before and after paying

**Blocked by:** —

**Status:** ready-for-agent

**What to build:** the right is only stated in the Termos today. CDC wants the Cliente informed clearly at purchase. Add a short statement, all `launchBlocking`, linking to the Termos clause:

- Catalog cards and the "Comprar" action area (`src/content/catalog-page.ts`): one line near the price. Checkout is hosted by Appmax, so this is the last place we control before payment.
- FAQ (`src/content/faq.ts`): "Posso pedir reembolso?" next to the cancel question, scoped per Oferta (Mensal cancels renewals; the 7 days covers the first charge).
- Paid confirmation (`src/content/checkout-confirmation.ts`): one sentence plus how to request (02).
- Footer "Suporte & Termos": link to the clause.

Not "garantia": that word suggests a product-performance guarantee. The statutory right is *arrependimento*; copy says "7 dias para desistir da compra". Lawyer confirms.

- [ ] Line on catalog cards and the buy action, in a content file, `launchBlocking`
- [ ] FAQ entry, Oferta-scoped
- [ ] Sentence on the paid confirmation
- [ ] Each links to the Termos section anchor
- [ ] `pnpm test` passes

## Decisions / Notes

- Wireframe has no slot for this (checked 2026-10-05: no mention in `landing-page`, `catalogo-planos`, `painel-cliente`, `estados-licenca`). Slots to add in Figma, if the design should follow: a line in the `catalogo-planos` cards, an FAQ question in `landing-page`, a "Solicitar arrependimento" action in the `painel-cliente` "Central de suporte", a revoked-by-withdrawal state in `estados-licenca`.
