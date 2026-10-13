/**
 * Catalog read side — .scratch/storefront-v2/issues/02-catalog-d1-schema-and-module.md,
 * docs/adr/0008-catalog-in-d1-cart-and-admin.md.
 *
 * The one module that knows `robots` / `robot_offers` (migration 0012). Price integrity is
 * unchanged in kind from ADR-0006: checkout passes only the client's `robot_id` + `offer` to
 * `lookupOffer`, and the price comes from here, server-side. Only published Robôs (`available`,
 * `coming-soon`) are visible; `draft` and `archived` are not found. The one exception is
 * `listPublishedWithOffers(env, { includeDrafts: true })`, which the catalog page passes for an
 * admin so a draft can be previewed as the real card. The write side is `./admin.ts`.
 */

import type { CartOffer } from '../../shared/cart-limits';

type CatalogEnv = Pick<Cloudflare.Env, 'DB'>;

export type RobotStatus = 'draft' | 'available' | 'coming-soon' | 'archived';

/** Compra and Anual only: Mensal is on standby (ADR-0008) and `robot_offers` rejects it. */
export type OfferName = CartOffer;

/**
 * The Oferta stored on a purchase. Wider than `OfferName`: the catalog no longer sells Mensal,
 * but the subscription code (cancel, webhook, expiry) and any existing `monthly` row stay in
 * place until the all-Robôs Assinatura is designed (ADR-0008 "Standby").
 */
export type PurchaseOffer = OfferName | 'monthly';

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

export type RobotRow = {
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

export const ROBOT_COLUMNS =
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

export function toRobot(row: RobotRow): Robot {
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

/** Constant SQL lists (never user input), so they are safe to interpolate. */
const PUBLISHED_STATUSES = "'available', 'coming-soon'";
const PREVIEW_STATUSES = `${PUBLISHED_STATUSES}, 'draft'`;
const SELLING_STATUSES = "'available'";
const PREVIEW_SELLING_STATUSES = "'available', 'draft'";

/** Compra before Anual, for any query over `robot_offers` (`offer` is unambiguous even when joined to `robots`). */
export const OFFER_ORDER_SQL = "CASE offer WHEN 'one_time' THEN 0 ELSE 1 END";

/** Groups Oferta rows by Robô slug, keeping the rows' order. */
export function groupOffersBySlug(rows: readonly (RobotOffer & { slug: string })[]): Map<string, RobotOffer[]> {
	const bySlug = new Map<string, RobotOffer[]>();
	for (const { slug, offer, priceCents } of rows) {
		bySlug.set(slug, [...(bySlug.get(slug) ?? []), { offer, priceCents }]);
	}
	return bySlug;
}

/** Robôs on the public catalog (`available` and `coming-soon`), by `sort_order` then slug. */
export async function listPublished(env: CatalogEnv, options: { includeDrafts?: boolean } = {}): Promise<Robot[]> {
	const statuses = options.includeDrafts ? PREVIEW_STATUSES : PUBLISHED_STATUSES;
	const { results } = await env.DB.prepare(
		`SELECT ${ROBOT_COLUMNS} FROM robots WHERE status IN (${statuses}) ORDER BY sort_order, slug`
	).all<RobotRow>();
	return results.map(toRobot);
}

/** A published Robô by slug; `null` for unknown, draft and archived. */
export async function getPublishedBySlug(env: CatalogEnv, slug: string): Promise<Robot | null> {
	const row = await env.DB.prepare(
		`SELECT ${ROBOT_COLUMNS} FROM robots WHERE slug = ? AND status IN (${PUBLISHED_STATUSES})`
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
		ORDER BY ${OFFER_ORDER_SQL}`
	)
		.bind(slug)
		.all<RobotOffer>();
	return results;
}

/** A published Robô together with the Ofertas it sells (empty unless `available`), for the catalog page. */
export type PublishedRobot = Robot & { offers: RobotOffer[] };

/**
 * The public catalog in one pass: every published Robô with its Ofertas, Compra first. With
 * `includeDrafts` (admin preview only, the caller has checked `requireAdmin`) drafts are listed
 * too, with the Ofertas they would sell once published; checkout still treats them as unknown.
 */
export async function listPublishedWithOffers(
	env: CatalogEnv,
	options: { includeDrafts?: boolean } = {}
): Promise<PublishedRobot[]> {
	const selling = options.includeDrafts ? PREVIEW_SELLING_STATUSES : SELLING_STATUSES;
	const [robots, { results: offerRows }] = await Promise.all([
		listPublished(env, options),
		env.DB.prepare(
			`SELECT o.robot_slug AS slug, o.offer AS offer, o.price_cents AS priceCents
			FROM robot_offers o JOIN robots r ON r.slug = o.robot_slug
			WHERE r.status IN (${selling})
			ORDER BY ${OFFER_ORDER_SQL}`
		).all<RobotOffer & { slug: string }>(),
	]);
	const bySlug = groupOffersBySlug(offerRows);
	return robots.map((robot) => ({ ...robot, offers: bySlug.get(robot.slug) ?? [] }));
}

/** Slug to name for every Robô whatever its status: a purchase outlives the Robô being published. */
export async function listRobotNames(env: CatalogEnv): Promise<Map<string, string>> {
	const { results } = await env.DB.prepare('SELECT slug, name FROM robots').all<{ slug: string; name: string }>();
	return new Map(results.map((row) => [row.slug, row.name]));
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
