# Releasing a `rejected` purchase (manual, 0.1)

A purchase lands `rejected` when the webhook's authoritative refetch shows the gateway
charged an amount different from `purchases.amount_cents` (ADR-0006, PLANNING.md §6 Price
integrity). The Cliente **was charged**. Sentry carries an `amount mismatch` event with the
purchase id, the expected and the reported amount. Nothing is provisioned while `rejected`:
no `customers` row, no login email, no Licença.

## Resolve

1. Find the purchase from the Sentry event's `purchase_id`:

   ```sql
   SELECT id, robot_id, offer, amount_cents, status, provider, appmax_order_id FROM purchases WHERE id = '<purchase_id>';
   ```

2. Decide against the gateway dashboard (Appmax order, `amounts.sub_total`):
   - **Legitimate** (the catalog price really was that amount, or the difference is
     acceptable): release it.
   - **Not legitimate**: refund in the gateway. The refund webhook moves it to `refunded`.

3. Release. `rejected` (rank 1) is below `active` (rank 2), so the flip is allowed:

   ```sql
   UPDATE purchases SET status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<purchase_id>' AND status = 'rejected';
   ```

4. A flip in SQL does not run the webhook's activation step, so provision the Cliente by
   hand: `pnpm run provision-customer -- --purchase-id=<purchase_id> --email=<email>`.

Do not edit `amount_cents` to match: it is the record of what the Cliente agreed to pay.

## An antifraud refusal shows as `refunded` (pending sandbox check)

A card paid on our own checkout (ADR-0007) sits in antifraud review (`autorizado`) before it is
approved. When Appmax's antifraud refuses it, the order status is `recusado_por_risco`, which
the webhook maps to `refunded` (`mapOrderStatus` in `src/modules/billing/appmax-client.ts`).
Whether money ever moved in that case is not known yet: appmax-checkout 08 checks it in the
sandbox and 07 decides the mapping from that. Until then, for a purchase that is `refunded`:

1. Look at the order in the Appmax dashboard. If its status is `recusado_por_risco`, it is an
   antifraud refusal, not a refund we granted.
2. If the purchase was never `active` (`paid_at` is NULL), nothing was provisioned: no
   Licença, no login e-mail. Nothing to revoke; the Cliente can buy again from the catalog.
3. If it was `active` before (`paid_at` set), the Licença is already revoked (expiry set to
   now). Confirm in Appmax that the charge was reversed; if the Cliente was charged and it was
   not, refund it in Appmax and tell the Cliente.

```sql
SELECT id, status, paid_at, appmax_order_id FROM purchases WHERE id = '<purchase_id>';
```
