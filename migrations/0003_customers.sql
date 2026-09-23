-- Customer identity — .scratch/customer-area/issues/01-customer-identity-provisioning.md.
--
-- The first point at which any Cliente identity exists in this system
-- (spec.md's "Solution"): a `customers` row is written when the webhook's
-- existing Appmax-authoritative status re-fetch (checkout-webhooks ticket
-- 04) first confirms a subscription `active`, reusing that same call
-- rather than trusting the webhook payload or adding a new outbound call
-- (PLANNING.md §6, §7 — "the account is provisioned from payment, not
-- before it").
--
-- `subscription_id UNIQUE` encodes spec.md's "single active subscription
-- per customer, for 0.1" decision: one `customers` row per subscription,
-- looked up 1:1. No `REFERENCES` FK — this codebase doesn't use them
-- (see `subscriptions.plan_id`), plain `TEXT` + app-level integrity only.
-- The UNIQUE constraint is also what makes provisioning idempotent: an
-- `INSERT ... ON CONFLICT(subscription_id) DO NOTHING` from a reapplied
-- `active` webhook event is a single atomic statement, no prior SELECT,
-- same TOCTOU reasoning as `processed_webhooks` and the `subscriptions`
-- CAS update.
CREATE TABLE customers (
	id TEXT PRIMARY KEY,
	subscription_id TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Login (ticket 02) looks a Cliente up by the email they type at /login.
CREATE INDEX idx_customers_email ON customers (email);
