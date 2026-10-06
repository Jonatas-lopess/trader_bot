# Withdrawal (arrependimento) refund (manual, 0.1)

CDC art. 49 gives the Cliente 7 days from purchase to withdraw. Honored by a manual refund
in Appmax; the Licença is then revoked by expiry-to-now (ADR-0006 "Withdrawal", PLANNING.md
§9). The Termos de uso carries the clause (`withdrawalBody` in `src/content/legal.ts`,
placeholder until a lawyer words it).

## Steps

0. **Intake.** The request arrives at the support mailbox (`suporte@…`, a plain mailbox, not
   Resend) from the "Solicitar arrependimento" link on `/conta`, which prefills the subject and
   body with the purchase id and the Cliente's e-mail. Answer within **2 dias úteis** (owner
   decision, withdrawal-guarantee/04). Check that the sender is the e-mail on the purchase's
   Cliente (`customers.email`); if not, ask the Cliente to write from it. A free-form e-mail
   without the prefilled data counts as a request all the same: find the purchase by e-mail:

   ```sql
   SELECT p.id, p.robot_id, p.offer, p.status, p.created_at FROM purchases p JOIN customers c ON c.id = p.customer_id WHERE c.email = '<email>' ORDER BY p.created_at;
   ```

   Reply template (placeholder wording until the lawyer approves it):

   > Olá! Recebemos seu pedido de arrependimento da compra `<purchase_id>`. Ele está dentro
   > do prazo de 7 dias e o reembolso foi solicitado; o valor volta pela mesma forma de
   > pagamento. Sua Licença foi revogada. Qualquer dúvida, responda este e-mail.

   If the request is outside the 7 days, answer the same way but say it is out of the period,
   and decide any goodwill refund by hand (it is not this path).

1. Confirm the request is within 7 days of the purchase (`purchases.created_at`, counted
   in calendar days in Brasília time, UTC-3: the purchase day does not count and day 7 runs to
   its end, same rule as `withdrawalWindowOpen`; `created_at` is UTC, so subtract 3 hours first) and find it:

   ```sql
   SELECT id, robot_id, offer, status, amount_cents, appmax_order_id, created_at FROM purchases WHERE id = '<purchase_id>';
   ```

2. Refund the order in the Appmax dashboard. Appmax reports it as `estornado`, which the
   webhook maps to `refunded`. That write also sets `licenses.expires_at` to now
   (`deriveLicenseExpiry`, ticket 05), so the Licença reads `revoked` in `/conta` and any
   download link already minted returns 404.

   **Mensal:** the right covers the first charge only, and a Mensal is one `purchases` row
   across renewals (`created_at` never moves). Refund the first charge, then also cancel the
   subscription in Appmax so no renewal charges the Cliente afterwards. Whether Appmax's
   `estornado` on the first order already cancels the subscription is unverified: check it in
   the test phase and drop this extra step if it does. A refund of a later renewal is outside
   this path.

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
