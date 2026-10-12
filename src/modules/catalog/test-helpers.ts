import { env } from 'cloudflare:workers';
import type { OfferName, RobotStatus } from './robots';

// D1 persists across the tests of a file, so a test that seeds Robôs clears the catalog first
// (`beforeEach(clearCatalog)`) to keep list and ordering assertions independent.
export async function clearCatalog(): Promise<void> {
	await env.DB.batch([env.DB.prepare('DELETE FROM robot_offers'), env.DB.prepare('DELETE FROM robots')]);
}

// Seeds one Robô row plus its offers (price in cents) straight into D1, for tests that need a
// catalog: the catalog module's own tests, and the checkout/webhook tests that used to read
// `content/catalog.ts`. Defaults give a published, buyable Robô, so pass only what the test is
// about. Writes bypass the module on purpose; its write side belongs to the admin.
export async function seedRobot(params: {
	slug: string;
	name?: string;
	shortDescription?: string;
	longDescription?: string;
	strategyType?: string;
	market?: string[] | null;
	perfil?: string | null;
	supportedCorretoras?: string[] | null;
	status?: RobotStatus;
	sortOrder?: number;
	offers?: Partial<Record<OfferName, number>>;
}): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO robots
			(slug, name, short_description, long_description, strategy_type, market, perfil, supported_corretoras, status, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(
			params.slug,
			params.name ?? `Robô ${params.slug}`,
			params.shortDescription ?? `Descrição curta de ${params.slug}.`,
			params.longDescription ?? `Descrição longa de ${params.slug}.`,
			params.strategyType ?? 'Tendência',
			params.market ? JSON.stringify(params.market) : null,
			params.perfil ?? null,
			params.supportedCorretoras ? JSON.stringify(params.supportedCorretoras) : null,
			params.status ?? 'available',
			params.sortOrder ?? 0
		)
		.run();
	for (const [offer, priceCents] of Object.entries(params.offers ?? {})) {
		await env.DB.prepare('INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES (?, ?, ?)')
			.bind(params.slug, offer, priceCents)
			.run();
	}
}
