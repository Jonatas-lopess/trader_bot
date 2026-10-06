# 04: Owner decisions for the withdrawal path

**Blocked by:** —

**Status:** resolved

**What to build:** nothing in code. Four decisions only the owner (or the lawyer) can make. Record each answer under `## Answer` below; the tickets that wait on it say which.

1. **Support address** (`suporte@<domain>`) and whether replies go through Resend or a plain mailbox. Feeds 01. Does not block the build, only go-live.
2. **Target answer time** for a withdrawal request (e.g. "até 2 dias úteis"). Feeds 02 (runbook, Cliente copy).
3. **Start of the 7 days:** purchase date or delivery of the Licença. CDC art. 49 says "assinatura ou recebimento". Default in 02 is purchase date; the lawyer confirms. Feeds 02 and the Termos clause.
4. **Mensal renewals:** how each renewal is stored (new `purchases` row or not), and whether the 7 days covers only the first charge. Needs a look at the webhook and `deriveLicenseExpiry` before answering. Feeds 02.

- [x] Each of the four has an answer under `## Answer`
- [x] 02's Notes updated if 3 or 4 change its scope

## Answer

Owner answered 1-3 on 2026-10-06; 4 answered from the code (webhook, `deriveLicenseExpiry`, `cancel.ts`).

1. **Support address:** `suporte@robotrader.com.br` (already in `src/content/support.ts`). Replies from a **plain mailbox**, not Resend (inbound forwarding to the owner's inbox, e.g. Cloudflare Email Routing). No code change; Resend stays transactional-only. Still a go-live prerequisite: the domain and the mailbox must exist.
2. **Target answer time:** "até 2 dias úteis". Goes into the runbook and the Cliente copy, `launchBlocking`.
3. **Start of the 7 days:** purchase date (`purchases.created_at`). The lawyer still confirms against "assinatura ou recebimento"; the Termos clause and 02's copy stay `launchBlocking`.
4. **Mensal renewals:** a Mensal is **one `purchases` row** for its whole life, keyed by `appmax_subscription_id`. A renewal webhook re-applies `active` to the same row through the CAS: `created_at` and `paid_at` never move (`PAID_AT_SQL` keeps the first), and `deriveLicenseExpiry` only extends `expires_at` (`extend_to`). No new row per renewal; the only record of each renewal is `webhook_deliveries` / `processed_webhooks`.
   - **Decision:** the 7 days covers the **first charge only**. `withdrawalWindowOpen(created_at)` is already correct for Mensal with no special case: after day 7 the link disappears even though later renewals keep the row `active`.
   - **Consequence for the runbook:** refunding the first Mensal charge does not by itself stop the subscription. Step 2 must also cancel the subscription in Appmax so no renewal charges the Cliente afterwards (to verify against Appmax in the test phase: whether `estornado` on the first order cancels the subscription on their side). Refunding a later renewal is out of the right: it is a goodwill decision handled by hand, not through this path.
