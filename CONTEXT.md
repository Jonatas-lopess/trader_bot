# Robô Trader

Sells and delivers Robôs: automated trading programs that a Cliente installs and runs
against their own Corretora. The business sells the right to run them; it never holds or
moves anyone's money.

## Language

### Commercial

**Catálogo**:
The list of Robôs on sale, each with its Ofertas and prices. First-party only: every Robô in
it is ours, there are no third-party sellers.
_Avoid_: loja, marketplace, vitrine, planos

**Oferta**:
One way to acquire a Robô: **Compra** (one payment, perpetual Licença), **Anual** (one
payment, 12-month Licença) or **Mensal** (recurring card charge, Licença renewed by each
payment). A Robô lists up to three. Compra is the main offer; Anual and Mensal are the
time-bounded side options.
_Avoid_: plano, pacote, tier, produto

**Compra**:
The one-time Oferta: a single payment for a perpetual Licença of one Robô.
_Avoid_: venda, pedido, assinatura

**Assinatura**:
A Cliente's recurring agreement to pay for the Mensal Oferta of one Robô. Governs money and
renewal, nothing else. Compra and Anual are not Assinaturas.
_Avoid_: contrato, licença, plano

**Cliente**:
A person who holds or has held a Compra, an Anual or an Assinatura.
_Avoid_: usuário, comprador, conta

### Product

**Robô**:
A trading program in the Catálogo, identified by a slug. Each Robô has its own binary and its
own Ofertas.
_Avoid_: bot, software, produto, algoritmo

**Licença**:
The right to run one Robô, bounded by an expiry date and bound to one Corretora account. A
Compra's Licença is perpetual: its expiry is a far-future date, so it still ends early on
refund or chargeback. Distinct from Assinatura: a Mensal payment can be made before a Licença
is issued, and a Licença can outlive a cancelled Assinatura until its expiry date passes. One
active Licença per Cliente per Robô.
_Avoid_: assinatura, chave, permissão

**Chave**:
The credential that lets an installed Robô run.
_Avoid_: licença, token, serial

**Corretora**:
The brokerage where a Cliente holds their trading account and their money. Always outside
our systems.
_Avoid_: exchange, banco, broker

### Payment

**Boleto**:
A Brazilian payment voucher. Confirms up to one business day after the Cliente pays, so
nothing that depends on it can be treated as immediate.
_Avoid_: fatura, invoice

**Pix**:
Brazilian instant transfer. Settles immediately but cannot carry a recurring charge.
_Avoid_: transferência

---

## Resolved by the catalog pivot

Both terms below were open under the Plano model (`"1 / 3 / robôs ativos"`,
"Corretora vinculada"). ADR-0006 removed the entitlement axes they counted, so nothing is left
to count: one Licença binds one Robô and one Corretora account. Kept here so old tickets that
mention them can be read.

**Robô ativo** and **Corretora vinculada**:
No longer terms. Superseded by the Licença definition above.

## Open terms

Terms in active use that are not yet defined. Left undefined on purpose — inventing a
definition here would commit us to a model we have not chosen.

**Chave vs. Corretora API credential**:
Chave (above) is the credential that lets an installed Robô run. The landing page's "como
funciona" frame (`6:48`) separately describes connecting the Cliente's Corretora account via
its own API credential, and originally named that credential "chave" too — the same word for
two different secrets on the page that explains the product. Not resolved here: whether the
Corretora credential gets its own term or "Chave" gets scoped/qualified. See
`.scratch/marketing-pages/issues/05-landing-video-and-steps.md` and
`src/content/how-it-works.ts`, which sidesteps the literal collision in shipped copy without
deciding it.
