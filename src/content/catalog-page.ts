/**
 * `/catalog` page content — heading, offer labels, the regulatory note and the
 * per-Robô card view-models, plus the landing page's catalog band.
 *
 * `.scratch/catalog-pivot/issues/06-catalog-page.md`; ADR-0006, ADR-0008. Robô
 * and price facts live in D1 (`src/modules/catalog`); this file keeps only the
 * copy and turns the rows the page loaded into cards (`buildCatalogCards`),
 * never importing them. Consumed by `src/pages/catalog.astro`,
 * `src/components/robot-card.astro` and `src/components/catalog-teaser.astro`.
 *
 * launch-blocking call sites in this file:
 *
 *   grep -rn "launchBlocking(" src/content/catalog-page.ts
 */

import type { OfferName, PublishedRobot, RobotStatus } from '../modules/catalog/robots';
import { launchBlocking } from '../shared/launch-blocking';
import { withdrawalHref } from './legal';

export const pageTitle = 'Catálogo de Robôs';
export const pageDescription =
	'Escolha um Robô para MetaTrader 5 e a forma de contratar: compra única ou anual.';
export const pageHeading = 'Escolha o seu Robô';

// Compra is the main offer (CONTEXT.md — Oferta); Anual is secondary. Mensal is on standby
// (ADR-0008), so the catalog shows neither a row nor a button for it.
export const offerOrder: OfferName[] = ['one_time', 'annual'];

// Price-row labels. "Assinatura" stays reserved for the recurring agreement (CONTEXT.md),
// so the rows are named for what the Cliente gets, not "Assinatura Anual".
export const offerLabels: Record<OfferName, string> = {
	one_time: 'Licença Perpétua',
	annual: 'Anual',
};

// Shown instead of the cards when no Robô is published (a fresh install, or all hidden).
export const emptyCatalogMessage = 'Os Robôs estão sendo preparados. Volte em breve.';

// Accessible name of the card grid.
export const catalogListLabel = 'Robôs do catálogo';

// "Saiba mais" modal (storefront-v2 06). The button's accessible name carries the Robô, so a
// screen reader's button list does not read "Saiba mais" six times in a row.
export const learnMoreLabel = 'Saiba mais';
export const learnMoreLabelFor = (card: Pick<CatalogCard, 'name'>): string =>
	`${learnMoreLabel} sobre ${card.name}`;
export const dialogCloseLabel = 'Fechar';
export const addToCartLabel = 'Adicionar ao carrinho';

export const comingSoonLabel = 'Em breve';
export const strategyTypeLabel = 'Estratégia';
export const marketLabel = 'Mercado';
export const perfilLabel = 'Perfil';
export const detailsHeading = 'Detalhes do Robô';
export const buyLabelPrefix = 'Comprar';
// Accessible name of the price rows' radio group.
export const priceRowsLabel = 'Forma de contratar';

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
	amountCents: number;
	priceText: string;
	href: string;
};

export type CatalogCard = {
	slug: string;
	name: string;
	shortDescription: string;
	/** Shown in the "Saiba mais" modal; admin-entered plain text, line breaks kept. */
	longDescription: string;
	strategyType: string;
	/** Empty when the Robô declares no market. */
	market: string[];
	/** Risk and horizon profile ("Conservador / Médio Prazo"); null when the Robô declares none. */
	perfil: string | null;
	/** Published statuses only: a draft or archived Robô never becomes a card. */
	status: Extract<RobotStatus, 'available' | 'coming-soon'>;
	/** In Compra, Anual order; empty for a coming-soon Robô. */
	offers: CardOffer[];
};

export type CardInfoRow = { label: string; value: string };

/**
 * The informational rows under the description, in order: Estratégia (always),
 * then Mercado and Perfil only when the Robô declares them (no dash, no
 * "a definir"). Corretoras compatíveis is not a card row (figma-restyle 11).
 */
export const cardInfoRows = (card: CatalogCard): CardInfoRow[] => [
	{ label: strategyTypeLabel, value: card.strategyType },
	...(card.market.length > 0 ? [{ label: marketLabel, value: card.market.join(', ') }] : []),
	...(card.perfil ? [{ label: perfilLabel, value: card.perfil }] : []),
];

/** The withdrawal line for a card; null when the Robô has nothing to buy (coming soon). */
export const cardWithdrawalNote = (card: CatalogCard): typeof buyWithdrawalNote | null =>
	card.offers.length > 0 ? buyWithdrawalNote : null;

export type CardBuy = { label: string; href: string };

/**
 * The Oferta a card selects before the Cliente picks one: Compra, or the first
 * Oferta the Robô sells when it has no Compra. Null when there is nothing to buy
 * (coming soon). It is also what the buy link points at without JavaScript.
 */
export const defaultOffer = (card: CatalogCard): CardOffer | null =>
	card.offers.find((o) => o.offer === 'one_time') ?? card.offers[0] ?? null;

/**
 * The price a compact card shows: Compra, falling back to the lowest Oferta the Robô sells.
 * Its label is shown with it so "R$ 497" is never read as the perpetual price. Null for a
 * coming-soon Robô (nothing to buy, so no price).
 */
export const cardMainPrice = (card: CatalogCard): CardOffer | null =>
	card.offers.find((o) => o.offer === 'one_time') ??
	card.offers.reduce<CardOffer | null>((lowest, o) => (!lowest || o.amountCents < lowest.amountCents ? o : lowest), null);

export type CardPriceRow = CardOffer & { selected: boolean };

/** The card's price rows in Compra, Anual order, exactly one marked selected. */
export const cardPriceRows = (card: CatalogCard): CardPriceRow[] => {
	const selected = defaultOffer(card);
	return card.offers.map((offer) => ({ ...offer, selected: offer === selected }));
};

/**
 * The card's single buy button: "Comprar <Robô name>", pointing at the default
 * Oferta. The price rows pick the Oferta in the browser (figma-restyle 13) by
 * swapping this href for the row's own. Null when there is nothing to buy.
 */
export const cardBuy = (card: CatalogCard): CardBuy | null => {
	const offer = defaultOffer(card);
	return offer ? { label: `${buyLabelPrefix} ${card.name}`, href: offer.href } : null;
};

/** One card per published Robô, with the Ofertas it sells in Compra, Anual order. */
export const buildCatalogCards = (robots: PublishedRobot[]): CatalogCard[] =>
	robots.map((robot) => ({
		slug: robot.slug,
		name: robot.name,
		shortDescription: robot.shortDescription,
		longDescription: robot.longDescription,
		strategyType: robot.strategyType,
		market: robot.market ?? [],
		perfil: robot.perfil,
		status: robot.status === 'coming-soon' ? 'coming-soon' : 'available',
		offers: offerOrder.flatMap((offer) => {
			const sold = robot.offers.find((o) => o.offer === offer);
			if (!sold) return [];
			return [
				{
					offer,
					label: offerLabels[offer],
					amountCents: sold.priceCents,
					priceText: formatBrl(sold.priceCents),
					href: checkoutHref(robot.slug, offer),
				},
			];
		}),
	}));

// ---------------------------------------------------------------------
// Landing catalog band (was plan-teaser, marketing-pages 08)
// ---------------------------------------------------------------------

// A plain link band: the landing stays prerendered, and the Robôs and prices live in D1,
// readable only per request. Listing them is `/catalog`'s job.
export const teaserBadge = 'Catálogo';
export const teaserHeading = 'Comece pelo Robô certo para você';
export const teaserCtaLabel = 'Ver catálogo completo';
export const teaserCtaHref = '/catalog';
