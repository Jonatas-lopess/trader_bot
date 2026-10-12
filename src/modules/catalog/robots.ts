/**
 * Catalog read side — .scratch/storefront-v2/issues/02-catalog-d1-schema-and-module.md,
 * docs/adr/0008-catalog-in-d1-cart-and-admin.md.
 *
 * The one module that knows `robots` / `robot_offers` (migration 0012). Price integrity is
 * unchanged in kind from ADR-0006: checkout passes only the client's `robot_id` + `offer` to
 * `lookupOffer`, and the price comes from here, server-side. Only published Robôs (`available`,
 * `coming-soon`) are visible; `draft` and `archived` are not found. The write side (admin) is a
 * separate ticket.
 */

type CatalogEnv = Pick<Cloudflare.Env, 'DB'>;

export type RobotStatus = 'draft' | 'available' | 'coming-soon' | 'archived';

/** Compra and Anual only: Mensal is on standby (ADR-0008) and `robot_offers` rejects it. */
export type OfferName = 'one_time' | 'annual';

export type Robot = {
	/**
	 * Kebab-case and frozen after the first Compra: it is in `/checkout?robot=`,
	 * `robots/<slug>/` in R2 and `purchases.robot_id`.
	 */
	slug: string;
	name: string;
	shortDescription: string;
	longDescription: string;
	strategyType: string;
	/** Where the Robô operates, as free labels ("Mini Índice"). Null when not declared. */
	market: string[] | null;
	/** Risk and horizon profile, one free label. Null when not declared. */
	perfil: string | null;
	supportedCorretoras: string[] | null;
	status: RobotStatus;
	sortOrder: number;
};

export type RobotOffer = { offer: OfferName; priceCents: number };

export type LookupOfferResult =
	| { kind: 'found'; amountCents: number }
	| { kind: 'unknown_robot' }
	| { kind: 'unknown_offer' };

type RobotRow = {
	slug: string;
	name: string;
	short_description: string;
	long_description: string;
	strategy_type: string;
	market: string | null;
	perfil: string | null;
	supported_corretoras: string | null;
	status: RobotStatus;
	sort_order: number;
};

const ROBOT_COLUMNS =
	'slug, name, short_description, long_description, strategy_type, market, perfil, supported_corretoras, status, sort_order';

/** Anything that is not a JSON array of strings reads as absent: a bad cell must not 500 the catalog. */
function parseStringArray(json: string | null): string[] | null {
	if (json === null) return null;
	try {
		const parsed: unknown = JSON.parse(json);
		if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
	} catch {
		// fall through to absent
	}
	return null;
}

function toRobot(row: RobotRow): Robot {
	return {
		slug: row.slug,
		name: row.name,
		shortDescription: row.short_description,
		longDescription: row.long_description,
		strategyType: row.strategy_type,
		market: parseStringArray(row.market),
		perfil: row.perfil,
		supportedCorretoras: parseStringArray(row.supported_corretoras),
		status: row.status,
		sortOrder: row.sort_order,
	};
}

/** Robôs on the public catalog (`available` and `coming-soon`), by `sort_order` then slug. */
export async function listPublished(env: CatalogEnv): Promise<Robot[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${ROBOT_COLUMNS} FROM robots WHERE status IN ('available', 'coming-soon') ORDER BY sort_order, slug`
	).all<RobotRow>();
	return results.map(toRobot);
}

/** A published Robô by slug; `null` for unknown, draft and archived. */
export async function getPublishedBySlug(env: CatalogEnv, slug: string): Promise<Robot | null> {
	const row = await env.DB.prepare(
		`SELECT ${ROBOT_COLUMNS} FROM robots WHERE slug = ? AND status IN ('available', 'coming-soon')`
	)
		.bind(slug)
		.first<RobotRow>();
	return row ? toRobot(row) : null;
}

/** The Ofertas an `available` Robô sells (Compra first); empty for any other status or an unknown slug. */
export async function listOffersFor(env: CatalogEnv, slug: string): Promise<RobotOffer[]> {
	const { results } = await env.DB.prepare(
		`SELECT o.offer AS offer, o.price_cents AS priceCents
		FROM robot_offers o JOIN robots r ON r.slug = o.robot_slug
		WHERE o.robot_slug = ? AND r.status = 'available'
		ORDER BY CASE o.offer WHEN 'one_time' THEN 0 ELSE 1 END`
	)
		.bind(slug)
		.all<RobotOffer>();
	return results;
}

/**
 * Server-side price lookup. `robotId` and `offer` come straight from the client, so both are
 * untrusted strings: they only ever reach D1 as bound parameters and match exactly. Draft and
 * archived Robôs are `unknown_robot`; a Robô that is published but does not sell the Oferta
 * (including any `coming-soon` Robô) is `unknown_offer`.
 */
export async function lookupOffer(env: CatalogEnv, robotId: string, offer: string): Promise<LookupOfferResult> {
	const robot = await getPublishedBySlug(env, robotId);
	if (!robot) return { kind: 'unknown_robot' };
	const sold = (await listOffersFor(env, robot.slug)).find((o) => o.offer === offer);
	if (!sold) return { kind: 'unknown_offer' };
	return { kind: 'found', amountCents: sold.priceCents };
}
