# License activation (manual, 0.1)

Issuance has a human in it (PLANNING.md §8, ADR-0006). This is the operator runbook from "the
Cliente entered a Corretora account" to "the Cliente has a download link".

A Licença id (`license_id`) is its purchase id (`purchases.id`).

## Steps

1. **Find Licenças waiting on you** (`preparing` = account entered, binary not yet issued):

   ```sql
   SELECT l.purchase_id, l.robot_id, l.corretora_account, p.status AS purchase_status
   FROM licenses l JOIN purchases p ON p.id = l.purchase_id
   WHERE l.status = 'preparing';
   ```

2. **Compile** `robots/<robot_id>/` in MetaEditor with the Corretora account from
   `corretora_account` baked in. Source is never served.
3. **Upload** the `.ex5` to R2 under exactly `licenses/<license_id>.ex5`
   (bucket `trader-bot-robot-binary`):

   ```
   wrangler r2 object put trader-bot-robot-binary/licenses/<license_id>.ex5 --file=<path> --content-type=application/octet-stream --remote
   ```

4. **Activate** — flips `preparing` → `active` and emails the download link:

   ```
   pnpm run activate-license -- --license-id=<license_id> --origin=<site origin>
   ```

## What the script refuses

| Reason | Meaning |
| --- | --- |
| `purchase_not_payable` | Purchase is refunded, chargeback, held (`rejected`), `pending`, or missing. |
| `binary_missing` | Nothing at `licenses/<license_id>.ex5` yet. Upload first. |
| `not_preparing` | Licença is still `awaiting_account` (Cliente has not entered the account), or already `active`. |
| `customer_not_found` | No `customers` row for the purchase; nothing was flipped. See `provision-customer`. |
| `email_failed` | Licença **is now active**; use `send-download-link` to resend. |

## Resending the link

Links last 48h and can be reused inside that window. For an `active` Licença:

```
pnpm run send-download-link -- --license-id=<license_id> --origin=<site origin>
```

Minting is refused for any Licença that is not `active`.

## Refunds

A refund (7-day withdrawal) sets the purchase to `refunded`, which revokes the Licença: an
already-minted link stops downloading (404) and no new one can be minted. The binary stays in
R2; delete it by hand if wanted.

## Not built

`/conta` has no download button: delivery is the emailed link only, per PLANNING.md §8
("no self-service resend for 0.1"). A Cliente who lost the email asks support, who resend it.
