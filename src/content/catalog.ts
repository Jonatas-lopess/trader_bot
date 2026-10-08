/**
 * Catalog content — the Robôs on sale and their Ofertas (Compra, Anual,
 * Mensal), with prices in cents.
 *
 * ADR-0006 "Server-side price"; PLANNING.md §6 Price integrity. This file is
 * the only source of prices: checkout (catalog-pivot 03) calls `lookupOffer`
 * with the client's `robot_id` + `offer` and nothing else reads prices. The
 * catalog is bundled into the Worker, with no runtime write path.
 *
 * Replaces `plans.ts` as the source of catalog facts; `plans.ts` is removed by
 * tickets 06/10, not here.
 *
 * Every robot, price and claim below is a placeholder until the business
 * supplies the real ones. See `docs/agents/content-files.md`.
 *
 * launch-blocking call sites in this file:
 *
 *   grep -rn "launchBlocking(" src/content/catalog.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export type OfferName = 'one_time' | 'annual' | 'monthly';

export type CorretoraName = string;

export type RobotStatus = 'available' | 'coming-soon';

/** Price in integer cents (BRL), launch-blocked until the business sets real prices. */
export type OfferPrice = LaunchBlocking<number>;

export type Robot = {
	/**
	 * Kebab-case and frozen after the first Compra: it is in `/checkout?robot=`,
	 * `robots/<slug>/` in R2 and `purchases.robot_id`. Renaming it orphans all three.
	 */
	slug: string;
	name: LaunchBlocking<string>;
	shortDescription: LaunchBlocking<string>;
	strategyType: LaunchBlocking<string>;
	/**
	 * Where the Robô operates, as free labels ("Mini Índice", "Mini Dólar"). Not an
	 * enum (nothing filters by it), not the MT5 symbol (changes with the contract
	 * expiry), not the timeframe. Optional: the card omits the row when absent.
	 */
	market?: LaunchBlocking<string[]>;
	/** Optional: the card omits the row when absent. Only `/catalog` reads it. */
	supportedCorretoras?: LaunchBlocking<CorretoraName[]>;
	status: RobotStatus;
	/** Up to three Ofertas; a robot lists only the ones it sells. */
	offers: Partial<Record<OfferName, OfferPrice>>;
};

const placeholderName = 'Placeholder robot: real Robôs and names not supplied yet (ADR-0006 "Open"; catalog-pivot spec).';
const placeholderPrice =
	'Placeholder price: no real price set by the business. Server-side source of truth for checkout (ADR-0006 "Server-side price", PLANNING.md §6 Price integrity).';
const placeholderClaim =
	'Placeholder claim: unverified strategy/compatibility copy, not approved for launch (CDC art. 37; PLANNING.md §2, §12).';

export const catalog: Robot[] = [
	{
		slug: 'robo-exemplo-a',
		name: launchBlocking('Robô Exemplo A', placeholderName),
		shortDescription: launchBlocking('Descrição curta do Robô Exemplo A.', placeholderClaim),
		strategyType: launchBlocking('Tendência', placeholderClaim),
		market: launchBlocking(['Mini Índice', 'Mini Dólar'], placeholderClaim),
		supportedCorretoras: launchBlocking(['Corretora Exemplo'], placeholderClaim),
		status: 'available',
		offers: {
			one_time: launchBlocking(99700, placeholderPrice),
			annual: launchBlocking(49700, placeholderPrice),
			monthly: launchBlocking(9700, placeholderPrice),
		},
	},
	{
		slug: 'robo-exemplo-b',
		name: launchBlocking('Robô Exemplo B', placeholderName),
		shortDescription: launchBlocking('Descrição curta do Robô Exemplo B.', placeholderClaim),
		strategyType: launchBlocking('Reversão à média', placeholderClaim),
		market: launchBlocking(['Mini Índice'], placeholderClaim),
		supportedCorretoras: launchBlocking(['Corretora Exemplo'], placeholderClaim),
		status: 'available',
		offers: {
			one_time: launchBlocking(149700, placeholderPrice),
		},
	},
	{
		slug: 'robo-exemplo-c',
		name: launchBlocking('Robô Exemplo C', placeholderName),
		shortDescription: launchBlocking('Em breve.', placeholderClaim),
		strategyType: launchBlocking('Scalping', placeholderClaim),
		status: 'coming-soon',
		offers: {},
	},
	{
		slug: 'robo-exemplo-d',
		name: launchBlocking('Robô Exemplo D', placeholderName),
		shortDescription: launchBlocking('Descrição curta do Robô Exemplo D.', placeholderClaim),
		strategyType: launchBlocking('Rompimento', placeholderClaim),
		market: launchBlocking(['Mini Dólar'], placeholderClaim),
		supportedCorretoras: launchBlocking(['Corretora Exemplo'], placeholderClaim),
		status: 'available',
		offers: {
			one_time: launchBlocking(119700, placeholderPrice),
			monthly: launchBlocking(11700, placeholderPrice),
		},
	},
	{
		slug: 'robo-exemplo-e',
		name: launchBlocking('Robô Exemplo E', placeholderName),
		shortDescription: launchBlocking('Em breve.', placeholderClaim),
		strategyType: launchBlocking('Swing trade', placeholderClaim),
		status: 'coming-soon',
		offers: {},
	},
];

export type LookupOfferResult =
	| { kind: 'found'; amountCents: number }
	| { kind: 'unknown_robot' }
	| { kind: 'unknown_offer' };

const isOwn = (obj: object, key: string): boolean => Object.hasOwn(obj, key);

/**
 * Pure server-side price lookup. `robotId` and `offer` come straight from the
 * client, so both are untrusted strings: only own keys resolve, and an offer a
 * robot does not sell is `unknown_offer`.
 */
export const lookupOffer = (robotId: string, offer: string): LookupOfferResult => {
	const robot = catalog.find((r) => r.slug === robotId);
	if (!robot) return { kind: 'unknown_robot' };
	if (!isOwn(robot.offers, offer)) return { kind: 'unknown_offer' };
	const price = robot.offers[offer as OfferName];
	if (!price) return { kind: 'unknown_offer' };
	return { kind: 'found', amountCents: price.value };
};
