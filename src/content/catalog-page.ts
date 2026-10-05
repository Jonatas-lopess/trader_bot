/**
 * `/catalog` page content — heading, offer labels, the regulatory note and the
 * per-Robô card view-models, plus the landing page's catalog teaser.
 *
 * `.scratch/catalog-pivot/issues/06-catalog-page.md`; ADR-0006. Robô and price
 * facts live in `src/content/catalog.ts` and are read from there, never
 * duplicated (`docs/agents/content-files.md` "Facts shared across pages").
 * Consumed by `src/pages/catalog.astro`, `src/components/robot-card.astro`
 * and `src/components/catalog-teaser.astro`.
 *
 * launch-blocking call sites in this file:
 *
 *   grep -rn "launchBlocking(" src/content/catalog-page.ts
 */

import { launchBlocking, unwrapLaunchBlocking } from '../shared/launch-blocking';
import { catalog, type OfferName, type RobotStatus } from './catalog';
import { withdrawalHref } from './legal';

export const pageTitle = 'Catálogo de Robôs';
export const pageDescription =
	'Escolha um Robô para MetaTrader 5 e a forma de contratar: compra única, anual ou mensal.';
export const pageHeading = 'Escolha o seu Robô';

// Compra is the main offer (CONTEXT.md — Oferta); Anual and Mensal are secondary.
export const offerOrder: OfferName[] = ['one_time', 'annual', 'monthly'];

export const offerLabels: Record<OfferName, string> = {
	one_time: 'Comprar',
	annual: 'Anual',
	monthly: 'Mensal',
};

// Shown next to the price of each Oferta so the buyer sees what they are buying.
export const offerCaptions: Record<OfferName, string> = {
	one_time: 'pagamento único, Licença perpétua',
	annual: 'pagamento único, 12 meses',
	monthly: 'por mês, somente cartão',
};

export const carouselLabel = 'Robôs do catálogo';
export const carouselPrevLabel = 'Robô anterior';
export const carouselNextLabel = 'Próximo Robô';

export const comingSoonLabel = 'Em breve';
export const strategyTypeLabel = 'Estratégia';
export const marketLabel = 'Mercado';
export const corretorasLabel = 'Corretoras compatíveis';

// Carried over from the Plans page (marketing-pages 07). The "Economize 20%"
// figure was a Figma frame claim with no annual price behind it, and the
// catalog's annual prices are placeholders, so no discount can be stated.
export const annualSavingsBadge = launchBlocking(
	'Economize 20%',
	'Frame claim (marketing-pages 07) with no real annual price behind it: catalog annual prices are ' +
		'placeholders (ADR-0006 "Open"). Do not compute a discount and ship it; confirm the real one first.',
);

// One line under the buy area of every card with something to buy. Checkout is hosted by
// Appmax, so this is the last place we control before payment (withdrawal-guarantee 03).
// "Desistir da compra", never "garantia": the statutory right is arrependimento, and
// "garantia" reads as a product-performance guarantee (CDC art. 37).
export const buyWithdrawalNote = {
	text: launchBlocking(
		'7 dias para desistir da compra.',
		'CDC art. 49 / ADR-0006 Withdrawal: informing the Cliente of the 7-day withdrawal at purchase; ' +
			'wording ("desistir da compra", not "garantia") is a placeholder a lawyer confirms. ' +
			'Mensal: only the first charge is inside the right (ticket 04 decision 4 pending).',
	),
	linkLabel: 'Saiba mais',
	href: withdrawalHref,
};

// PLANNING.md §6: Pix is the cheaper, faster-settling method for a single annual charge.
export const annualPixNote = launchBlocking(
	'Anual à vista no Pix.',
	'PLANNING.md §6 Pix steer for annual billing (Pix ~0.99%/D+1 vs card ~4.19%/D+31); wording is a ' +
		'placeholder and Appmax onboarding is pending (PLANNING.md §12).',
);

// Real compliance copy, ships verbatim (same register as `legalNotice` in footer.ts).
export const regulatoryNote =
	'Este site e os Robôs têm caráter exclusivamente informativo e de automação de ' +
	'ordens. Nada nesta página constitui recomendação de investimento, oferta de valores ' +
	'mobiliários, consultoria financeira ou sugestão de compra ou venda de qualquer ativo. A ' +
	'escolha da Corretora, a configuração dos parâmetros de risco e a decisão de contratar, ' +
	'manter ou cancelar a contratação são de responsabilidade exclusiva do Cliente. Resultados ' +
	'passados obtidos com qualquer configuração de um Robô não constituem garantia de ' +
	'resultados futuros — o Cliente é o único responsável pelas ordens enviadas à sua ' +
	'Corretora e pelos ganhos ou perdas delas decorrentes.';

const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Whole reais without decimals, otherwise two decimals: 99700 → "R$ 997", 9750 → "R$ 97,50". */
export const formatBrl = (cents: number): string => {
	const reais = cents / 100;
	const text = Number.isInteger(reais)
		? brl.format(reais)
		: reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	return `R$ ${text}`;
};

/** Checkout takes only `robot` + `offer`; the price is looked up server-side (ADR-0006). */
export const checkoutHref = (robotSlug: string, offer: OfferName): string =>
	`/checkout?robot=${encodeURIComponent(robotSlug)}&offer=${offer}`;

export type CardOffer = {
	offer: OfferName;
	label: string;
	caption: string;
	amountCents: number;
	priceText: string;
	href: string;
};

export type CatalogCard = {
	slug: string;
	name: string;
	shortDescription: string;
	strategyType: string;
	/** Empty when the Robô declares no market. */
	market: string[];
	/** Empty when the Robô declares no Corretoras. */
	corretoras: string[];
	status: RobotStatus;
	/** In Compra, Anual, Mensal order; empty for a coming-soon Robô. */
	offers: CardOffer[];
};

export type CardInfoRow = { label: string; value: string };

/**
 * The informational rows under the description, in order: Estratégia (always),
 * then Mercado and Corretoras compatíveis only when their list is non-empty
 * (no dash, no "a definir").
 */
export const cardInfoRows = (card: CatalogCard): CardInfoRow[] => [
	{ label: strategyTypeLabel, value: card.strategyType },
	...(card.market.length > 0 ? [{ label: marketLabel, value: card.market.join(', ') }] : []),
	...(card.corretoras.length > 0
		? [{ label: corretorasLabel, value: card.corretoras.join(', ') }]
		: []),
];

/** The withdrawal line for a card; null when the Robô has nothing to buy (coming soon). */
export const cardWithdrawalNote = (card: CatalogCard): typeof buyWithdrawalNote | null =>
	card.offers.length > 0 ? buyWithdrawalNote : null;

export const catalogCards: CatalogCard[] = catalog.map((robot) => ({
	slug: robot.slug,
	name: unwrapLaunchBlocking(robot.name),
	shortDescription: unwrapLaunchBlocking(robot.shortDescription),
	strategyType: unwrapLaunchBlocking(robot.strategyType),
	market: robot.market ? unwrapLaunchBlocking(robot.market) : [],
	corretoras: robot.supportedCorretoras ? unwrapLaunchBlocking(robot.supportedCorretoras) : [],
	status: robot.status,
	offers:
		robot.status === 'coming-soon'
			? []
			: offerOrder.flatMap((offer) => {
					const price = robot.offers[offer];
					if (!price) return [];
					return [
						{
							offer,
							label: offerLabels[offer],
							caption: offerCaptions[offer],
							amountCents: price.value,
							priceText: formatBrl(price.value),
							href: checkoutHref(robot.slug, offer),
						},
					];
				}),
}));

// ---------------------------------------------------------------------
// Landing catalog teaser (was plan-teaser, marketing-pages 08)
// ---------------------------------------------------------------------

export const teaserBadge = 'Catálogo';
export const teaserHeading = 'Comece pelo Robô certo para você';
export const teaserCtaLabel = 'Ver catálogo completo';
export const teaserCtaHref = '/catalog';

export type TeaserCard = Pick<CatalogCard, 'slug' | 'name' | 'shortDescription' | 'status'> & {
	/** Compra price when the Robô sells one; otherwise null. */
	fromPriceText: string | null;
};

export const teaserCards: TeaserCard[] = catalogCards.map((card) => ({
	slug: card.slug,
	name: card.name,
	shortDescription: card.shortDescription,
	status: card.status,
	fromPriceText: card.offers.find((o) => o.offer === 'one_time')?.priceText ?? null,
}));
