# 06: Landing — social proof, with every figure flagged

**What to build:** The `social-proof` band (`6:83`): badge "Resultados Reais", heading "A comunidade de traders que mais cresce no Brasil", the metrics pair (+2.500 Traders Ativos, R$ 12M+ Operados na Plataforma) and the three testimonial cards (`6:96`). Layout matches the frame at 1440px and collapses to a single column on mobile.

**Nothing in this section is true, and one line of it is actively dangerous.**

Every figure and quote is placeholder (PLANNING.md §2). They ship behind the launch-blocking marker, each one individually flagged:

- `+2.500 Traders Ativos` and `R$ 12M+ Operados na Plataforma` — invented figures. "Operados na Plataforma" is also wrong on its own terms: the business never holds or moves anyone's money (CONTEXT.md), so no volume is operated on a platform of ours.
- "A comunidade de traders que mais cresce no Brasil" — an unqualifiable superlative.
- Thiago Mendes, Camila Ribeiro, Rodrigo Costa — invented people with invented track records.
- Thiago's quote, "Fechei os últimos 3 meses no positivo de forma muito consistente", is the single highest-risk string on the site. PLANNING.md §2 cites it by name: CDC art. 37 treats invented performance claims as publicidade enganosa, and processors read exactly this register as "get rich quick" when they judge category risk. Pagar.me onboarding is an unresolved prerequisite (§12).

So this ticket delivers the layout and an explicit, greppable inventory of what must be replaced with verifiable figures or deleted before launch — not verified content. Deleting the whole band is a legitimate outcome of that decision; build it so removal is one content-file change, not a layout rescue.

**Figma:** `6:83` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-83

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Metrics pair and testimonial row match frame `6:83` at 1440px
- [ ] Both rows collapse to a single column at mobile widths
- [ ] Avatar placeholders render deliberately — no stock photos of people who did not say this
- [ ] Every metric, superlative, name and quote sits in a typed content file behind the launch-blocking marker
- [ ] The whole section can be removed by emptying the content file, with no layout breakage
- [ ] No copy added in this ticket promises returns, profit or consistent results
