# Robô Trader

Sells and delivers the Robô Trader: an automated trading program that a Cliente installs
and runs against their own Corretora. The business sells the right to run it; it never
holds or moves anyone's money.

## Language

### Commercial

**Plano**:
A named commercial offer — Starter, Pro, Enterprise — pairing a price with a set of
entitlements.
_Avoid_: pacote, tier, produto

**Assinatura**:
A Cliente's recurring agreement to pay for a Plano. Governs money and renewal, nothing else.
_Avoid_: contrato, licença, plano

**Cliente**:
A person who holds or has held an Assinatura.
_Avoid_: usuário, comprador, conta

### Product

**Robô**:
The trading program sold to Clientes. One program, not a family of them.
_Avoid_: bot, software, produto, algoritmo

**Licença**:
The right to run the Robô, bounded by an expiry date. Distinct from Assinatura: an
Assinatura can be paid before a Licença is issued, and a Licença can outlive a cancelled
Assinatura until its expiry date passes.
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

## Open terms

Terms in active use that are not yet defined. Left undefined on purpose — inventing a
definition here would commit us to a model we have not chosen.

**Robô ativo**:
Used by every Plano to express an entitlement — "1 / 3 / robôs ativos simultâneos". It is
not yet decided whether this counts running instances, configurations, or Corretora
connections. The three readings are different products. Resolve before Licenças are issued
automatically, because the chosen reading is what has to be counted.

**Corretora vinculada**:
Sold as a separate entitlement axis from Robô ativo. Whether the two are genuinely
independent, or whether one Robô ativo implies exactly one Corretora vinculada, is still
undecided as a *counting* question. Partially resolved as a *verification* question by
`.scratch/license-server/spec.md`'s §Corretora binding: once an account is bound to a
license (collected at purchase), the Robô must be actually connected to that account
(`AccountInfoInteger(ACCOUNT_LOGIN)`, read live, never from local config) or the check-in
fails — but how many accounts one license may bind, and how that interacts with the Robô
ativo cap, remains open.

**Chave vs. Corretora API credential**:
Chave (above) is the credential that lets an installed Robô run. The landing page's "como
funciona" frame (`6:48`) separately describes connecting the Cliente's Corretora account via
its own API credential, and originally named that credential "chave" too — the same word for
two different secrets on the page that explains the product. Not resolved here: whether the
Corretora credential gets its own term or "Chave" gets scoped/qualified. See
`.scratch/marketing-pages/issues/05-landing-video-and-steps.md` and
`src/content/how-it-works.ts`, which sidesteps the literal collision in shipped copy without
deciding it.
