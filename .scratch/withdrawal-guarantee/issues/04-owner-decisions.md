# 04: Owner decisions for the withdrawal path

**Blocked by:** —

**Status:** ready-for-human

**What to build:** nothing in code. Four decisions only the owner (or the lawyer) can make. Record each answer under `## Answer` below; the tickets that wait on it say which.

1. **Support address** (`suporte@<domain>`) and whether replies go through Resend or a plain mailbox. Feeds 01. Does not block the build, only go-live.
2. **Target answer time** for a withdrawal request (e.g. "até 2 dias úteis"). Feeds 02 (runbook, Cliente copy).
3. **Start of the 7 days:** purchase date or delivery of the Licença. CDC art. 49 says "assinatura ou recebimento". Default in 02 is purchase date; the lawyer confirms. Feeds 02 and the Termos clause.
4. **Mensal renewals:** how each renewal is stored (new `purchases` row or not), and whether the 7 days covers only the first charge. Needs a look at the webhook and `deriveLicenseExpiry` before answering. Feeds 02.

- [ ] Each of the four has an answer under `## Answer`
- [ ] 02's Notes updated if 3 or 4 change its scope

## Answer

_(pending)_
