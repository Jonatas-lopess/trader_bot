-- Local-dev catalog seed — .scratch/storefront-v2/issues/02-catalog-d1-schema-and-module.md.
--
-- The five placeholder Robôs of src/content/catalog.ts (Mensal prices dropped: ADR-0008), so
-- `/catalog` and checkout have something to show against a local D1. Every name, claim and
-- price is a placeholder, not approved for launch (PLANNING.md §2, §12).
--
-- DEV ONLY. Never a migration and never run against production; real Robôs are created from
-- the admin. Safe to re-run: it replaces these five slugs and leaves other rows alone.
--
--   pnpm exec wrangler d1 execute trader-bot-db --local --file=scripts/seed-catalog.sql

DELETE FROM robot_offers WHERE robot_slug IN ('robo-exemplo-a', 'robo-exemplo-b', 'robo-exemplo-c', 'robo-exemplo-d', 'robo-exemplo-e');

INSERT OR REPLACE INTO robots
	(slug, name, short_description, long_description, strategy_type, market, perfil, supported_corretoras, status, sort_order)
VALUES
	('robo-exemplo-a', 'Robô Exemplo A', 'Descrição curta do Robô Exemplo A.',
		'Descrição longa do Robô Exemplo A (texto de exemplo, não aprovado para lançamento).',
		'Tendência', '["Mini Índice","Mini Dólar"]', NULL, '["Corretora Exemplo"]', 'available', 10),
	('robo-exemplo-b', 'Robô Exemplo B', 'Descrição curta do Robô Exemplo B.',
		'Descrição longa do Robô Exemplo B (texto de exemplo, não aprovado para lançamento).',
		'Reversão à média', '["Mini Índice"]', NULL, '["Corretora Exemplo"]', 'available', 20),
	('robo-exemplo-c', 'Robô Exemplo C', 'Em breve.',
		'Descrição longa do Robô Exemplo C (texto de exemplo, não aprovado para lançamento).',
		'Scalping', NULL, NULL, NULL, 'coming-soon', 30),
	('robo-exemplo-d', 'Robô Exemplo D', 'Descrição curta do Robô Exemplo D.',
		'Descrição longa do Robô Exemplo D (texto de exemplo, não aprovado para lançamento).',
		'Rompimento', '["Mini Dólar"]', NULL, '["Corretora Exemplo"]', 'available', 40),
	('robo-exemplo-e', 'Robô Exemplo E', 'Em breve.',
		'Descrição longa do Robô Exemplo E (texto de exemplo, não aprovado para lançamento).',
		'Swing trade', NULL, NULL, NULL, 'coming-soon', 50);

-- Prices in integer cents (BRL). Compra (one_time) and Anual (annual) only.
INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES
	('robo-exemplo-a', 'one_time', 99700),
	('robo-exemplo-a', 'annual', 49700),
	('robo-exemplo-b', 'one_time', 149700),
	('robo-exemplo-d', 'one_time', 119700);
