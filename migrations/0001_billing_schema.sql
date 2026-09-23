-- Billing schema for checkout-webhooks (.scratch/checkout-webhooks/spec.md).
--
-- `subscriptions` is the provisional record created at checkout-session time
-- (spec.md "Provisional record"): one row per checkout attempt, keyed by our
-- own reference (not Appmax's order id, which isn't known until the Cliente
-- reaches the hosted checkout). No Cliente identity columns — PLANNING.md §7,
-- "the account is provisioned from payment, not before it".
--
-- `payment_method` is nullable until Appmax reports it (return redirect or
-- webhook); ticket 03's status endpoint uses it together with `status` to
-- tell a generic pending from the Boleto-specific "awaiting up to one
-- business day" state (spec.md "Status endpoint").
CREATE TABLE subscriptions (
	id TEXT PRIMARY KEY,
	plan_id TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
	payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('card', 'boleto', 'pix')),
	appmax_order_id TEXT,
	appmax_subscription_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- The webhook (ticket 04) finds a subscription by whichever id Appmax's
-- payload references; a delivery for an id with no match is ignored (spec.md
-- "Webhook trust model" — user story 9), not an index-less table scan.
CREATE INDEX idx_subscriptions_appmax_order_id ON subscriptions (appmax_order_id);
CREATE INDEX idx_subscriptions_appmax_subscription_id ON subscriptions (appmax_subscription_id);

-- Idempotency store (spec.md "D1 concurrency — compare-and-swap, not
-- read-then-write"). `id` is the composite key the application computes —
-- `event:order_id` for one-time events, `event:subscription_id:order_id` for
-- subscription-lifecycle events (Appmax's own recommendation, PLANNING.md
-- §6) — as a single PRIMARY KEY column rather than a multi-column composite
-- key: SQLite's uniqueness check does not treat two NULLs as equal, which
-- would silently defeat a composite PRIMARY KEY across nullable columns for
-- one-time events with no subscription_id. A single deterministic string
-- has no such gap. The `UNIQUE`/`PRIMARY KEY` violation on insert *is* the
-- "already processed" signal (user story 6) — no prior `SELECT`.
CREATE TABLE processed_webhooks (
	id TEXT PRIMARY KEY,
	payload TEXT NOT NULL,
	received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
