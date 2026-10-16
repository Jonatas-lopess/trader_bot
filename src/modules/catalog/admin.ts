/**
 * Catalog write side — .scratch/storefront-v2/issues/05-admin-catalog-crud.md,
 * docs/adr/0008-catalog-in-d1-cart-and-admin.md.
 *
 * Create, edit and change the status of a Robô and its Ofertas. The server validates
 * everything: the form only sends strings, and this module turns them into rows or into field
 * errors (codes, never copy; `src/content/admin.ts` words them). Callers (the `/admin/robos`
 * pages) have already passed `requireAdmin` and `assertSameOrigin`.
 *
 * Rules kept here: slug kebab-case and unique; frozen once any `purchases.robot_id` names it;
 * prices are integer cents within a sane bound; an `available` Robô sells at least one Oferta;
 * no hard delete, only `archived` (reversible). Changing a price never touches
 * `purchases.amount_cents`: that column is a snapshot written at checkout.
 */

import { CART_OFFERS, SLUG_PATTERN } from '../../shared/cart-limits';
import { renameGalleryStatement } from './gallery';
import { OFFER_ORDER_SQL, ROBOT_COLUMNS, groupOffersBySlug, toRobot, type OfferName, type Robot, type RobotOffer, type RobotRow, type RobotStatus } from './robots';

type CatalogAdminEnv = Pick<Cloudflare.Env, 'DB'>;

export const robotStatuses: RobotStatus[] = ['draft', 'available', 'coming-soon', 'archived'];

/** R$ 100.000,00: a typo guard, not a business rule. */
export const maxPriceCents = 10_000_000;

// `/admin/robos/new` is a page, so a Robô with that slug could never be opened for editing.
const reservedSlugs = new Set(['new']);

export type FieldName =
	| 'slug'
	| 'name'
	| 'shortDescription'
	| 'longDescription'
	| 'strategyType'
	| 'market'
	| 'perfil'
	| 'supportedCorretoras'
	| 'status'
	| 'sortOrder'
	| 'offers'
	| 'price_one_time'
	| 'price_annual';

export type FieldErrorCode =
	| 'required'
	| 'too-long'
	| 'too-many'
	| 'slug-format'
	| 'slug-reserved'
	| 'slug-taken'
	| 'slug-locked'
	| 'invalid-status'
	| 'invalid-number'
	| 'price-invalid'
	/** R$ 0,00: blank is how an Oferta is left out, so zero is never a price. */
	| 'price-zero'
	| 'price-too-high'
	| 'offers-required';

export type FieldErrors = Partial<Record<FieldName, FieldErrorCode>>;

/** What the form posts, untouched: every field a string so it can be shown back as typed. */
export type RobotFormInput = {
	slug: string;
	name: string;
	shortDescription: string;
	longDescription: string;
	strategyType: string;
	/** Comma-separated labels. */
	market: string;
	perfil: string;
	/** Comma-separated labels. */
	supportedCorretoras: string;
	status: string;
	sortOrder: string;
	/** Price in reais per Oferta; blank means not offered. */
	prices: Record<OfferName, string>;
};

export const emptyRobotForm: RobotFormInput = {
	slug: '',
	name: '',
	shortDescription: '',
	longDescription: '',
	strategyType: '',
	market: '',
	perfil: '',
	supportedCorretoras: '',
	status: 'draft',
	sortOrder: '0',
	prices: { one_time: '', annual: '' },
};

/** Reads the form fields the admin pages post. Missing fields read as empty, never throw. */
export function readRobotForm(form: FormData): RobotFormInput {
	const text = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : '';
	};
	return {
		slug: text('slug'),
		name: text('name'),
		shortDescription: text('shortDescription'),
		longDescription: text('longDescription'),
		strategyType: text('strategyType'),
		market: text('market'),
		perfil: text('perfil'),
		supportedCorretoras: text('supportedCorretoras'),
		status: text('status') || 'draft',
		sortOrder: text('sortOrder'),
		prices: { one_time: text('price_one_time'), annual: text('price_annual') },
	};
}

// ---------------------------------------------------------------------
// Price parsing
// ---------------------------------------------------------------------

export type ParsedPrice =
	| { ok: true; cents: number | null }
	| { ok: false; error: 'price-invalid' | 'price-zero' | 'price-too-high' };

const count = (text: string, char: string) => text.split(char).length - 1;

/**
 * "97", "97,5", "97.50", "R$ 1.997,00", "1,997.00" to integer cents; blank is `null` (not
 * offered); zero is `price-zero`. A lone comma is always the decimal mark (pt-BR); a lone dot is the decimal mark
 * unless exactly three digits follow it ("1.997" is 1997 reais). At most two decimals, no
 * sign, no exponent: anything else is `price-invalid`.
 */
export function parsePriceToCents(text: string): ParsedPrice {
	const cleaned = text.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
	if (cleaned === '') return { ok: true, cents: null };
	if (!/^\d[\d.,]*$/.test(cleaned)) return { ok: false, error: 'price-invalid' };

	const lastComma = cleaned.lastIndexOf(',');
	const lastDot = cleaned.lastIndexOf('.');
	let decimalAt = -1;
	if (lastComma >= 0 && lastDot >= 0) decimalAt = Math.max(lastComma, lastDot);
	else if (lastComma >= 0) decimalAt = count(cleaned, ',') === 1 ? lastComma : -1;
	else if (lastDot >= 0) decimalAt = count(cleaned, '.') === 1 && cleaned.length - lastDot - 1 !== 3 ? lastDot : -1;

	const whole = decimalAt < 0 ? cleaned : cleaned.slice(0, decimalAt);
	const fraction = decimalAt < 0 ? '' : cleaned.slice(decimalAt + 1);
	if (decimalAt >= 0 && !/^\d{1,2}$/.test(fraction)) return { ok: false, error: 'price-invalid' };
	if (!/^\d+$/.test(whole) && !/^\d{1,3}(?:([.,])\d{3}(?:\1\d{3})*)$/.test(whole)) return { ok: false, error: 'price-invalid' };

	const digits = whole.replace(/[.,]/g, '');
	if (digits.length > 9) return { ok: false, error: 'price-too-high' };
	const cents = Number(digits) * 100 + Number(fraction.padEnd(2, '0') || '0');
	if (cents > maxPriceCents) return { ok: false, error: 'price-too-high' };
	if (cents === 0) return { ok: false, error: 'price-zero' };
	return { ok: true, cents };
}

/** Cents back to what the form shows: 9750 to "97,50", 99700 to "997,00", 0 to "0,00". */
export function formatPriceForInput(cents: number): string {
	const reais = Math.floor(cents / 100);
	return `${reais},${String(cents % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

export type RobotWrite = {
	slug: string;
	name: string;
	shortDescription: string;
	longDescription: string;
	strategyType: string;
	market: string[] | null;
	perfil: string | null;
	supportedCorretoras: string[] | null;
	status: RobotStatus;
	sortOrder: number;
	offers: RobotOffer[];
};

const MAX_LABELS = 12;

/** Longest accepted text per form field, in characters. */
const ROBOT_LIMITS = {
	slug: 60,
	name: 80,
	shortDescription: 200,
	longDescription: 5000,
	strategyType: 60,
	perfil: 80,
	label: 60,
} as const;

function labelList(text: string): string[] {
	const seen = new Set<string>();
	for (const piece of text.split(',')) {
		const label = piece.trim();
		if (label !== '') seen.add(label);
	}
	return [...seen];
}

/**
 * Turns raw form strings into a write or field errors, all of them at once so the form can
 * flag every field in one round trip. Whether the slug is free or frozen needs D1 and is
 * checked by the caller (`createRobot`, `updateRobot`).
 */
export function validateRobotForm(
	input: RobotFormInput
): { ok: true; value: RobotWrite } | { ok: false; errors: FieldErrors } {
	const errors: FieldErrors = {};

	const text = (field: 'name' | 'shortDescription' | 'strategyType', max: number): string => {
		const value = input[field].trim();
		if (value === '') errors[field] = 'required';
		else if (value.length > max) errors[field] = 'too-long';
		return value;
	};
	const optionalText = (field: 'longDescription' | 'perfil', max: number): string => {
		const value = input[field].trim();
		if (value.length > max) errors[field] = 'too-long';
		return value;
	};
	const labels = (field: 'market' | 'supportedCorretoras'): string[] | null => {
		const list = labelList(input[field]);
		if (list.length > MAX_LABELS) errors[field] = 'too-many';
		else if (list.some((label) => label.length > ROBOT_LIMITS.label)) errors[field] = 'too-long';
		return list.length > 0 ? list : null;
	};

	const slug = input.slug.trim().toLowerCase();
	if (slug === '') errors.slug = 'required';
	else if (slug.length > ROBOT_LIMITS.slug || !SLUG_PATTERN.test(slug)) errors.slug = 'slug-format';
	else if (reservedSlugs.has(slug)) errors.slug = 'slug-reserved';

	const name = text('name', ROBOT_LIMITS.name);
	const shortDescription = text('shortDescription', ROBOT_LIMITS.shortDescription);
	const longDescription = optionalText('longDescription', ROBOT_LIMITS.longDescription);
	const strategyType = text('strategyType', ROBOT_LIMITS.strategyType);
	const market = labels('market');
	const perfil = optionalText('perfil', ROBOT_LIMITS.perfil);
	const supportedCorretoras = labels('supportedCorretoras');

	const status = input.status as RobotStatus;
	if (!robotStatuses.includes(status)) errors.status = 'invalid-status';

	const sortText = input.sortOrder.trim();
	let sortOrder = 0;
	if (sortText !== '') {
		sortOrder = Number(sortText);
		if (!/^-?\d+$/.test(sortText) || Math.abs(sortOrder) > 9999) errors.sortOrder = 'invalid-number';
	}

	const offers: RobotOffer[] = [];
	for (const offer of CART_OFFERS) {
		const parsed = parsePriceToCents(input.prices[offer]);
		if (!parsed.ok) errors[`price_${offer}`] = parsed.error;
		else if (parsed.cents !== null) offers.push({ offer, priceCents: parsed.cents });
	}
	if (status === 'available' && offers.length === 0 && !errors.price_one_time && !errors.price_annual) {
		errors.offers = 'offers-required';
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return {
		ok: true,
		value: {
			slug,
			name,
			shortDescription,
			longDescription,
			strategyType,
			market,
			perfil: perfil === '' ? null : perfil,
			supportedCorretoras,
			status,
			sortOrder,
			offers,
		},
	};
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

/** A Robô of any status with every Oferta it has stored, whether or not it sells them now. */
export type AdminRobot = Robot & { offers: RobotOffer[] };

async function offersBySlug(env: CatalogAdminEnv, slug?: string): Promise<Map<string, RobotOffer[]>> {
	const sql = `SELECT robot_slug AS slug, offer, price_cents AS priceCents FROM robot_offers
		${slug === undefined ? '' : 'WHERE robot_slug = ?'}
		ORDER BY ${OFFER_ORDER_SQL}`;
	const statement = env.DB.prepare(sql);
	const { results } = await (slug === undefined ? statement : statement.bind(slug)).all<RobotOffer & { slug: string }>();
	return groupOffersBySlug(results);
}

/** Every Robô, whatever its status, by `sort_order` then slug. */
export async function listAllRobots(env: CatalogAdminEnv): Promise<AdminRobot[]> {
	const [{ results }, offers] = await Promise.all([
		env.DB.prepare(`SELECT ${ROBOT_COLUMNS} FROM robots ORDER BY sort_order, slug`).all<RobotRow>(),
		offersBySlug(env),
	]);
	return results.map((row) => ({ ...toRobot(row), offers: offers.get(row.slug) ?? [] }));
}

/** One Robô of any status, or `null`. */
export async function getRobotForAdmin(env: CatalogAdminEnv, slug: string): Promise<AdminRobot | null> {
	const row = await env.DB.prepare(`SELECT ${ROBOT_COLUMNS} FROM robots WHERE slug = ?`).bind(slug).first<RobotRow>();
	if (!row) return null;
	const offers = await offersBySlug(env, slug);
	return { ...toRobot(row), offers: offers.get(slug) ?? [] };
}

/** Whether any purchase, of any status, names this slug (`purchases.robot_id`). */
export async function isSlugLocked(env: CatalogAdminEnv, slug: string): Promise<boolean> {
	const row = await env.DB.prepare('SELECT 1 AS hit FROM purchases WHERE robot_id = ? LIMIT 1').bind(slug).first();
	return row !== null;
}

/** The edit form's starting values for a stored Robô. */
export function toFormInput(robot: AdminRobot): RobotFormInput {
	const price = (offer: OfferName) => {
		const found = robot.offers.find((o) => o.offer === offer);
		return found ? formatPriceForInput(found.priceCents) : '';
	};
	return {
		slug: robot.slug,
		name: robot.name,
		shortDescription: robot.shortDescription,
		longDescription: robot.longDescription,
		strategyType: robot.strategyType,
		market: (robot.market ?? []).join(', '),
		perfil: robot.perfil ?? '',
		supportedCorretoras: (robot.supportedCorretoras ?? []).join(', '),
		status: robot.status,
		sortOrder: String(robot.sortOrder),
		prices: { one_time: price('one_time'), annual: price('annual') },
	};
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export type SaveResult = { ok: true; slug: string } | { ok: false; errors: FieldErrors };

const insertOffers = (env: CatalogAdminEnv, slug: string, offers: RobotOffer[]) =>
	offers.map(({ offer, priceCents }) =>
		env.DB.prepare('INSERT INTO robot_offers (robot_slug, offer, price_cents) VALUES (?, ?, ?)').bind(slug, offer, priceCents)
	);

async function slugExists(env: CatalogAdminEnv, slug: string): Promise<boolean> {
	return (await env.DB.prepare('SELECT 1 AS hit FROM robots WHERE slug = ?').bind(slug).first()) !== null;
}

/** D1 reports a primary-key or unique clash as an error whose message (or cause) says so. */
function isUniqueViolation(error: unknown): boolean {
	for (let current: unknown = error, depth = 0; current instanceof Error && depth < 3; current = current.cause, depth++) {
		if (/UNIQUE constraint failed/i.test(current.message)) return true;
	}
	return false;
}

/** A new Robô always starts as a draft: the form's status is ignored, publishing is a later step. */
export async function createRobot(env: CatalogAdminEnv, input: RobotFormInput): Promise<SaveResult> {
	const validated = validateRobotForm({ ...input, status: 'draft' });
	if (!validated.ok) return validated;
	const robot = validated.value;
	if (await slugExists(env, robot.slug)) return { ok: false, errors: { slug: 'slug-taken' } };

	// The check above and this write are not atomic: a concurrent create can take the slug first,
	// and the primary key then refuses the batch (all of it, so nothing is half-written).
	const statements = [
		env.DB.prepare(
			`INSERT INTO robots
				(slug, name, short_description, long_description, strategy_type, market, perfil, supported_corretoras, status, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
		).bind(
			robot.slug,
			robot.name,
			robot.shortDescription,
			robot.longDescription,
			robot.strategyType,
			robot.market && JSON.stringify(robot.market),
			robot.perfil,
			robot.supportedCorretoras && JSON.stringify(robot.supportedCorretoras),
			robot.sortOrder
		),
		...insertOffers(env, robot.slug, robot.offers),
	];
	try {
		await env.DB.batch(statements);
	} catch (error) {
		if (isUniqueViolation(error)) return { ok: false, errors: { slug: 'slug-taken' } };
		throw error;
	}
	return { ok: true, slug: robot.slug };
}

/**
 * Saves every field of the Robô currently at `currentSlug`, its status and the full set of
 * Ofertas (a blank price removes that Oferta). The slug may change only while no purchase names
 * the old one; the rename is guarded in SQL as well, so a purchase landing between the check and
 * the write cannot slip through. `purchases.amount_cents` is never touched. `null` is an unknown
 * slug.
 */
export async function updateRobot(
	env: CatalogAdminEnv,
	currentSlug: string,
	input: RobotFormInput
): Promise<SaveResult | null> {
	if ((await env.DB.prepare('SELECT 1 AS hit FROM robots WHERE slug = ?').bind(currentSlug).first()) === null) return null;
	const validated = validateRobotForm(input);
	if (!validated.ok) return validated;
	const robot = validated.value;

	const renaming = robot.slug !== currentSlug;
	if (renaming) {
		if (await isSlugLocked(env, currentSlug)) return { ok: false, errors: { slug: 'slug-locked' } };
		if (await slugExists(env, robot.slug)) return { ok: false, errors: { slug: 'slug-taken' } };
	}

	const guard = renaming ? 'AND NOT EXISTS (SELECT 1 FROM purchases WHERE robot_id = ?)' : '';
	const update = env.DB.prepare(
		`UPDATE robots SET slug = ?, name = ?, short_description = ?, long_description = ?, strategy_type = ?,
			market = ?, perfil = ?, supported_corretoras = ?, status = ?, sort_order = ?,
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE slug = ? ${guard}`
	);
	const values = [
		robot.slug,
		robot.name,
		robot.shortDescription,
		robot.longDescription,
		robot.strategyType,
		robot.market && JSON.stringify(robot.market),
		robot.perfil,
		robot.supportedCorretoras && JSON.stringify(robot.supportedCorretoras),
		robot.status,
		robot.sortOrder,
		currentSlug,
		...(renaming ? [currentSlug] : []),
	];
	// One atomic batch. Statements after the UPDATE act only if the new slug now exists, which is
	// true unless the guarded rename was refused (a purchase landed since the check above).
	const statements = [
		update.bind(...values),
		// After a successful rename the old slug is gone from `robots`, so the offers follow it;
		// after a refused one the old row is still there and the offers stay where they are.
		env.DB.prepare(
			'UPDATE robot_offers SET robot_slug = ? WHERE robot_slug = ? AND NOT EXISTS (SELECT 1 FROM robots WHERE slug = ?)'
		).bind(robot.slug, currentSlug, currentSlug),
		// The gallery follows the same way (robot-gallery 03); its R2 keys do not hold the slug.
		renameGalleryStatement(env, currentSlug, robot.slug),
		env.DB.prepare('DELETE FROM robot_offers WHERE robot_slug = ? AND EXISTS (SELECT 1 FROM robots WHERE slug = ?)').bind(
			robot.slug,
			robot.slug
		),
		...robot.offers.map(({ offer, priceCents }) =>
			env.DB.prepare(
				'INSERT INTO robot_offers (robot_slug, offer, price_cents) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM robots WHERE slug = ?)'
			).bind(robot.slug, offer, priceCents, robot.slug)
		),
	];
	let updated: D1Result;
	try {
		[updated] = await env.DB.batch(statements);
	} catch (error) {
		// A rename racing another create or rename onto the same slug: the primary key refuses it.
		if (renaming && isUniqueViolation(error)) return { ok: false, errors: { slug: 'slug-taken' } };
		throw error;
	}
	if (updated.meta.changes === 0) return { ok: false, errors: { slug: 'slug-locked' } };
	return { ok: true, slug: robot.slug };
}

export type StatusResult =
	| { ok: true }
	| { ok: false; error: 'not-found' | 'invalid-status' | 'offers-required' };

/**
 * Publish, unpublish, mark coming-soon, archive or restore without opening the form. Only the
 * status changes; `available` still needs a stored Oferta, the same rule as the form.
 */
export async function setRobotStatus(env: CatalogAdminEnv, slug: string, status: string): Promise<StatusResult> {
	if (!robotStatuses.includes(status as RobotStatus)) return { ok: false, error: 'invalid-status' };
	const robot = await getRobotForAdmin(env, slug);
	if (!robot) return { ok: false, error: 'not-found' };
	if (status === 'available' && robot.offers.length === 0) return { ok: false, error: 'offers-required' };

	await env.DB.prepare("UPDATE robots SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE slug = ?")
		.bind(status, slug)
		.run();
	return { ok: true };
}
