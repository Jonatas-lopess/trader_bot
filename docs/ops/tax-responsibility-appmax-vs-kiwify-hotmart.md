# Tax responsibility: Appmax vs Kiwify vs Hotmart

Researched 2026-10-12 from primary sources only (the platforms' own contracts and help
centers, planalto.gov.br, CONFAZ, gov.br). Nothing here is tax advice: confirm with the
contador (PLANNING.md §9, [nfse.md](nfse.md)) before relying on any of it.

## TL;DR

- **Using Appmax: yes, the taxes on the sale are ours.** Appmax's contract makes it a
  payment intermediary, "not a party" to the sale (cl. 1.6, 14.17). We are the seller, so we
  issue the NFS-e to the buyer and pay the ISS and the federal taxes of our regime ourselves.
  Appmax only issues a nota to us for its own fees (cl. 9.3).
- **Kiwify and Hotmart do not change that for Brazilian sales.** Kiwify's terms (cl. 9.7) and
  Hotmart BR's policy (cl. 1.6, 1.7.1) both put tax collection and the nota to the buyer on
  the producer. Neither is merchant of record for a Brazilian buyer. What they add is tooling
  (eNotas/Notazz hooks, co-production splits), not a transfer of liability.
- **Where they differ is international sales.** Kiwify becomes merchant of record only for
  non-resident buyers (Kiwify Inc.). Hotmart BV acts as commercial agent and, in some buyer
  countries, collects the VAT itself. Neither applies to a BRL sale to a Brazilian buyer.
- **Tax reform (CBS/IBS) does not shift this in 2026.** 2026 is a test year (0.9% CBS +
  0.1% IBS, collection waived for filers who meet the accessory obligations). Split payment
  is written into LC 214/2025, but a mandatory start date was not found.
- **Net:** switching to Kiwify or Hotmart would not remove the nota or ISS work. It would
  change fees and tooling, which is a pricing decision, not a tax one.

## Comparison

| Question | Appmax | Kiwify (Brazil) | Hotmart BR |
|---|---|---|---|
| Legal role | Gateway / "intermediadora"; "not a party, intervenor or guarantor" of the seller-buyer relationship. Pix: "Agente de Coleta" and final receiver of the funds, passed on to us net of fees | "Marketplace" plus software license plus payment intermediation; also "Subcredenciadora" for Kiwipay. "Not a party" to the sale | "Prestadora dos serviços de intermediação"; Hotpay is a "processadora de pagamentos" and "apenas um facilitador" |
| Merchant of record? | No | No (Brazilian buyers) | No (Brazilian buyers) |
| Who sells to the buyer | Us | The producer: "feito diretamente entre Criador de Conteúdo e o Comprador" | The producer, "vende diretamente ao Comprador" |
| Nota to the buyer | Us. Terms are silent on buyer notas; Help Center only shows third-party issuers (Bling, Notazz) | Producer: cl. 9.7, Kiwipay 3.5.1 ("valor total da venda, sem qualquer desconto e/ou retenção") | Producer: cl. 1.7.1 |
| ISS, PIS/COFINS, IRPJ/CSLL, DAS | Us | Producer: cl. 9.7 "único responsável por determinar, recolher, reter, declarar e remeter tributos" | Producer: cl. 1.6 "geralmente responsáveis pelo pagamento de quaisquer impostos às autoridades fiscais" |
| Nota the platform issues to us | Monthly, on the MDR and fees (cl. 9.3; license fee, annex V 7.2) | Monthly, by the 10th, on its fees (license plus payment intermediation) | Not stated in the policy; fee-tax obligations "poderão" exist (cl. 1.6) |
| Taxes withheld from our payout | None found. Only fees, reserve, chargebacks, anticipation (cl. 14.7, 14.10) | None found. Fees; may withhold balance for losses, penalties (cl. 5.3, 14.10, 15.4) | None for Brazil found; may deduct "despesas com obrigações tributárias" it incurs because of our conduct (cl. 12.1.1) and tax it pays after a product misclassification (cl. 1.8) |
| Reports to the tax authority | Not stated in the terms (DIMP, informe de rendimentos not found) | Kiwipay terms put the DIMP on the producer "se cabível"; Help Center says Kiwify reports sales per producer/co-producer in the DIMP | Hotmart "comunicação às autoridades competentes" where required (cl. 1.6.2) |
| Co-production / split | Split de pagamentos annex exists (seller side not analyzed) | Default: producer issues 100% of notas. With "divisão de responsabilidade fiscal" each party issues its share; Kiwify then also invoices co-producers for fees | "Parceria de Negócios": each issues for its share to the buyer. "Comissionamento": co-producer invoices the creator |
| International sales | Annex VI: the partner is "responsável pelo recolhimento de todos os tributos incidentes" (cl. 7.1) | **Non-resident buyer: Kiwify Inc. is "Merchant of Record"** (cl. 7.6). It buys from the vendor and resells; vendor issues invoices to Kiwify and pays the taxes on the export | **Hotmart BV is "Agente Comercial"**; creator generally collects and remits the tax. In some buyer jurisdictions the law makes Hotmart collect VAT/GST and invoice the buyer (cl. 1.6, 1.7.2) |

### Appmax details worth knowing

- Fees: the MDR is built from Appmax's per-transaction fee plus the acquirer's and issuer's
  cost, and it is owed "mesmo nos casos de Chargeback ou cancelamento" (cl. 1.2, 14.9). Appmax
  may create or change fees at will and may pass on costs when "haja criação/alteração de
  tributos" (cl. 14.13, 14.15). This matters for the tax reform: any new tax on Appmax's
  side can reach us as a fee increase.
- Cl. 9.3 says Appmax "realizar a retenção de todos os impostos que incidam sobre sua
  remuneração". The wording is ambiguous: it most plausibly means Appmax handles the taxes
  on its own fee revenue, not that it withholds anything from the sale. Not clarified in
  the sources found.
- **Not found:** any IOF, informe de rendimentos, or tax-withholding statement from Appmax to
  the seller. Ask `contabil@appmax.com.br` (the address the Help Center gives for invoice
  requests) rather than assuming.

### Legal anchors

- **ISS is the seller's tax.** LC 116/2003 list item **1.05** covers "Licenciamento ou
  cessão de direito de uso de programas de computação" (1.04 development, 1.09 streaming of
  content). ISS is due at the provider's establishment (art. 3 caput). I found no art. 3
  exception naming 1.04, 1.05 or 1.09. Art. 6 lets a municipality make a third party
  responsible by law, so a municipal rule for withholding or intermediaries is possible. We
  have not checked the seller's municipality.
- **STF:** ADI 1945 and ADI 5659 (ISS, not ICMS, on software licensing; effects from
  2021-03-03). Read only as search-result snippets from stf.jus.br; the pages returned 403,
  so the thesis text is unverified here. PLANNING.md §9 already relies on it.
- **Simples Nacional:** LC 123/2006 art. 18 §5º-D, V puts "licenciamento ou cessão de
  direito de uso de programas de computação" in **Anexo III**. Whether MEI covers the
  activity is outside this note (see nfse.md).
- **DIMP:** Convênio ICMS 134/2016 cl. 3 obliges "instituições e intermediadores financeiros
  e de pagamento" to report beneficiaries' operations to the states by the last day of the
  following month. The obligation is the intermediary's, not the seller's.
  Kiwify's own terms still list it among the producer's tasks "se cabível".
- **Tax reform (LC 214/2025, as amended by LC 227/2026):**
  - Art. 343 and 346: 2026 test rates, IBS 0.1% and CBS 0.9%. Art. 348: the amounts are
    offset against PIS/COFINS, collection is waived (§1) for those who meet the accessory
    obligations, and the test rates do not apply to Simples Nacional (III, c).
  - Art. 22: a "plataforma digital" (intermediary that controls collection, payment, terms
    or delivery) is liable for IBS/CBS, jointly or in substitution, in stated cases, but is
    not liable for differences if it supplies the information and split payment is available
    (§5-7).
  - Art. 31-33: payment service providers must segregate and remit IBS/CBS at financial
    settlement (split payment), with a standard and a simplified procedure.
  - **Open (inference, not stated in any source):** whether Appmax counts as a plataforma
    digital. It does not set terms or deliver the product, so a gateway looks outside the
    definition, while Kiwify and Hotmart look closer. Do not rely on this.
  - Status per search-result snippets from gov.br: Receita and CGIBS published the Split
    Payment platform's technical docs in 2026-06, with a test stage announced 2026-10-07.
    Those gov.br pages were auth-gated or not rendered for me, so treat this as unverified.
    A mandatory date for the split was not found. Simples Nacional rules for CBS/IBS
    reportedly start 2027-01-01 (CGSN Res. 191/2026, search snippet only, not read).

## Open items for the contador

1. Confirm that we issue the NFS-e on the sale price (`sub_total`) and not on the MDR-net amount.
2. Ask whether the seller's municipality has an ISS withholding or intermediary rule (LC 116 art. 6).
3. Ask how the 2026 CBS/IBS fields apply to our regime (MEI, Simples or Lucro Presumido).
4. Ask Appmax whether it files the DIMP and whether it issues any year-end statement.
5. Brazilian PF routes (carnê-leão, INSS) were not researched; the project assumes a CNPJ.

## Sources

Read in full or by clause (fetched 2026-10-12):

- Appmax, Termos e Condições de Uso, consolidated version of 2026-10-06, cl. 1.2, 1.6, 5.13, 8.5, 9.3, 14.7-14.17, annex V 7.2, annex VI 7.1: https://appmax.com.br/termos-de-uso/
- Appmax Help, "Como a Appmax emite Notas Fiscais": https://help-center.appmax.com.br/artigos/como-a-appmax-emite-notas-fiscais
- Appmax Help, "Integrando com o Notazz" (shows Notazz as the issuer, pulling Appmax orders): https://help-center.appmax.com.br/artigos/integrando-com-o-notazz
- Kiwify, Termos e Condições Gerais de Uso, version 2025-10-06, cl. 3.1, 5.2.16, 5.3, 7.6, 9.6, 9.7: https://kiwify.com.br/termos-de-uso/
- Kiwify, Termos da Ferramenta Kiwipay, version 2023-08-01, cl. 3.5, 3.5.1: https://kiwify.com.br/termos-de-uso-kiwipay/
- Kiwify, Terms and Conditions for Buyers and Vendors (merchant of record, international): https://kiwify.com/terms-and-conditions-buyers-and-vendors/
- Kiwify Ajuda, "A Kiwify emite nota fiscal sobre as taxas da plataforma?": https://ajuda.kiwify.com.br/pt-br/article/a-kiwify-emite-nota-fiscal-sobre-as-taxas-da-plataforma-1s1hyfl/
- Kiwify Ajuda, "Como funciona a coprodução?" (tax split, DIMP reporting): https://ajuda.kiwify.com.br/pt-br/article/como-funciona-a-coproducao-1mvmwx1/
- Kiwify Ajuda, "Eu sou um afiliado, como emitir notas fiscais?": https://ajuda.kiwify.com.br/pt-br/article/eu-sou-um-afiliado-como-emitir-notas-fiscais-icree5/
- Hotmart, Política Geral de Pagamentos, updated 2026-09-21, Visão geral C, cl. 1.1, 1.2, 1.5-1.8.1, 12.1.1: https://hotmart.com/pt-br/legal/politicas-de-pagamento
- LC 116/2003 (list items 1.04, 1.05, 1.09; arts. 3, 6): https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm
- LC 123/2006, art. 18 §5º-D: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm
- LC 214/2025 with LC 227/2026 amendments, arts. 22, 31-33, 343, 346, 348: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
- Convênio ICMS 134/2016, cl. 3 and 3-A (CONFAZ): https://www.confaz.fazenda.gov.br/legislacao/convenios/2016/CV134_16
- CGIBS, "Novo marco da Reforma Tributária inicia em 03 de agosto" (1% test rate, regular regime only): https://www.cgibs.gov.br/novo-marco-da-reforma-tributaria-inicia-em-03-de-agosto-com-preenchimento-obrigatorio-dos-campos-relativos-ao-ibs-e-a-cbs

Could not read (flagged above as unverified; only search-result snippets seen):

- Hotmart Help Center articles on global tax responsibility (JS-rendered, empty to the fetcher). Its list of jurisdictions where Hotmart collects VAT was not read; the policy only says such a list exists (cl. 1.6.1): https://help.hotmart.com/en/article/27142347940749/global-sales-tax-responsibilities-for-sales-made-on-hotmart
- STF news on ADI 1945 / 5659 (403): https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=478136&ori=1
- Receita Federal / Fazenda split payment platform news (auth-gated): https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/junho/receita-federal-e-cgibs-publicaram-hoje-a-documentacao-tecnica-da-plataforma-publica-do-split-payment
- Receita "Orientações da Reforma Tributária para 2026" (auth-gated): https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026

No blog or accounting-firm write-ups were used for any claim.
