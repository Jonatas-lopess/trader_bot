# 11: Research: automated compile/issuance and annual auto-renew

**Blocked by:** —

**Status:** deferred

**Type:** research, 1.0.0. Investigate how to automate per-Licença compile (MetaEditor headless on Windows, hosted runner, or in-Worker approaches) alongside license-authority automation; and Appmax yearly-interval support and the 15-days-before-renewal reminder email for Anual auto-renew. Output: findings file under this directory, then tickets. Not started; needs the milestone 1.0.0.


## Appmax findings (2026-09-29, docs.appmax.com.br)

Yearly interval: `POST /v1/subscriptions` accepts `interval` `"month"`/`"year"` with `interval_count` and optional `max_cycles`, so Anual auto-renew looks supported. Base order must be card or Pix, status `aprovado`/`integrado`. Still to confirm in sandbox that `"year"` works on our account and that Pix cannot auto-charge (PLANNING §6). The 15-day reminder email remains our own work. Not started.
