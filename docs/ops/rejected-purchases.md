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
