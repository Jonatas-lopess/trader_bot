-- Catalog in D1 — .scratch/storefront-v2/issues/02-catalog-d1-schema-and-module.md,
-- docs/adr/0008-catalog-in-d1-cart-and-admin.md.
--
-- `robots` and `robot_offers` replace the bundled src/content/catalog.ts as the source of
-- catalog facts and prices. Only `src/modules/catalog` knows these tables. Nothing is seeded
-- here: real Robôs are created from the admin, and the placeholders are a local-dev script
-- (scripts/seed-catalog.sql), never a migration.
--
-- `slug` is kebab-case (validated in code, not CHECKed) and frozen once a purchase references
-- it: it is in `/checkout?robot=`, `robots/<slug>/` in R2 and `purchases.robot_id`. Robôs are
-- archived, never deleted. As elsewhere in this codebase there is no FK: `purchases.robot_id`
-- carries a slug, and the module keeps `robot_offers.robot_slug` consistent.
--
-- `market` and `supported_corretoras` are JSON text arrays of strings (null when absent).
-- `status` is the launch gate that replaces `launchBlocking` on catalog values: only
-- `available` and `coming-soon` are public.
CREATE TABLE robots (
	slug TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	short_description TEXT NOT NULL,
	long_description TEXT NOT NULL DEFAULT '',
	strategy_type TEXT NOT NULL,
	market TEXT,
	perfil TEXT,
	supported_corretoras TEXT,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'available', 'coming-soon', 'archived')),
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_robots_status_sort_order ON robots (status, sort_order);

-- One row per Oferta a Robô sells, price in integer cents (BRL). Compra and Anual only: Mensal
-- is on standby (ADR-0008), and the future Assinatura is not a per-Robô Oferta. Offers exist
-- only for `available` Robôs; the module ignores any row on another status.
CREATE TABLE robot_offers (
	robot_slug TEXT NOT NULL,
	offer TEXT NOT NULL CHECK (offer IN ('one_time', 'annual')),
	price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
	PRIMARY KEY (robot_slug, offer)
) STRICT;
