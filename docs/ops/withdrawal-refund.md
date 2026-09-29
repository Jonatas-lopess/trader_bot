# Withdrawal (arrependimento) refund (manual, 0.1)

CDC art. 49 gives the Cliente 7 days from purchase to withdraw. Honored by a manual refund
in Appmax; the Licença is then revoked by expiry-to-now (ADR-0006 "Withdrawal", PLANNING.md
§9). The Termos de uso carries the clause (`withdrawalBody` in `src/content/legal.ts`,
placeholder until a lawyer words it).

## Steps

1. Confirm the request is within 7 days of the purchase (`purchases.created_at`) and find it:

   ```sql
   SELECT id, robot_id, offer, status, amount_cents, appmax_order_id, created_at FROM purchases WHERE id = '<purchase_id>';
   ```

2. Refund the order in the Appmax dashboard. Appmax reports it as `estornado`, which the
   webhook maps to `refunded`. That write also sets `licenses.expires_at` to now
   (`deriveLicenseExpiry`, ticket 05), so the Licença reads `revoked` in `/conta` and any
   download link already minted returns 404.

3. Verify after the webhook lands:

   ```sql
   SELECT p.status, l.status, l.expires_at FROM purchases p LEFT JOIN licenses l ON l.purchase_id = p.id WHERE p.id = '<purchase_id>';
   ```

   Expect `p.status = 'refunded'` and `l.expires_at` at or before the refund time.

## If the webhook never arrives

Do not edit `purchases.status` by hand unless the refund is confirmed in Appmax and the
webhook is gone for good. Then:

```sql
UPDATE purchases SET status = 'refunded', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<purchase_id>' AND status IN ('active', 'past_due', 'canceled');
UPDATE licenses SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE purchase_id = '<purchase_id>';
```

The Cliente's already-downloaded binary keeps running until the check-in enforcement in
`license-server` exists; revocation in 0.1 only stops new downloads and shows the state.
