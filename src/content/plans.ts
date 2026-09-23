/**
 * Plans content — page heading, the Anual/Mensal toggle, the three
 * plan-comparison cards, and the regulatory note for the `/planos` route
 * (ticket `.scratch/marketing-pages/issues/07-plans-page.md`, frame
 * `6:217`).
 *
 * See `docs/agents/content-files.md` for the typed-content-file and
 * launch-blocking conventions this follows. Consumed by
 * `src/pages/planos.astro`, `src/components/plans-toggle.astro` and
 * `src/components/plan-card.astro`.
 *
 * This file owns the plan catalog (PLANNING.md §6 Payments, §8 Licensing;
 * CONTEXT.md — Plano, Assinatura, Robô, Corretora). Ticket 08 (landing plan
 * teaser) imports prices/entitlements from here rather than duplicating
 * them — `docs/agents/content-files.md` "Facts shared across pages".
 *
 * launch-blocking call sites in this file:
 *
 *   grep -rn "launchBlocking(" src/content/plans.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export const pageHeading = 'Escolha o plano ideal para você';

// UI chrome shared by plan-card.astro and plan-teaser.astro — typed content,
// not inline strings in markup, per docs/agents/content-files.md.
export const popularBadgeLabel = 'Mais Popular';
export const monthlyPriceSuffix = '/mês';
export const featuresHeading = 'Métricas e Recursos';

// ---------------------------------------------------------------------
// Billing toggle
// ---------------------------------------------------------------------

export type BillingCycle = 'annual' | 'monthly';

export const defaultBillingCycle: BillingCycle = 'annual';

export const billingToggleLabels: Record<BillingCycle, string> = {
	annual: 'Anual',
	monthly: 'Mensal',
};

// "Economize 20%" (frame 6:235) — no annual price exists anywhere in this
// file (every Plan.price.annual below is `null`) and PLANNING.md §6's Pix
// steer for annual billing (Pix ~0.99%/D+1 vs card à vista ~4.19%/D+31,
// ~3.2pp cheaper and a month earlier) is not implemented on this page.
// Computing `monthly * 12 * 0.8` and shipping the result as a real annual
// price would invent a number the business hasn't set — do not do that.
// This is a missing-pricing-data + missing-Pix-steer decision for the
// business owner, not something to resolve by assumption.
// .scratch/marketing-pages/issues/07-plans-page.md; PLANNING.md §6.
export const annualSavingsBadge: LaunchBlocking<string> = launchBlocking(
	'Economize 20%',
	'No annual price exists in this content file (PlanPrice.annual is null on all three ' +
		"plans) and PLANNING.md §6's Pix steer for annual billing is not implemented here. " +
		'Do not compute monthly * 12 * 0.8 and ship it as a real price — missing-pricing-data ' +
		'+ missing-Pix-steer decision for the business owner. ' +
		'.scratch/marketing-pages/issues/07-plans-page.md.',
);

// Honest disclosure, not a marketing claim, so it ships unwrapped: while
// Anual is selected, the price shown is still the monthly figure, because
// no annual figure exists yet (see annualSavingsBadge above). This states
// that fact; it does not invent a Pix steer or a computed total.
export const noAnnualPriceNote =
	'Valor anual ainda não definido. Enquanto isso, o valor mensal permanece exibido em ' +
	'ambos os modos de cobrança.';

// ---------------------------------------------------------------------
// Plan catalog
// ---------------------------------------------------------------------

export type PlanId = 'starter' | 'pro' | 'enterprise';

export type PlanPrice = {
	monthly: number;
	// PLANNING.md §6: an annual plan is a single charge, steered toward
	// Pix. No such figure has been set by the business for any plan yet —
	// `null` means exactly that, not "free" and not a derived discount.
	annual: number | null;
};

export type PlanFeatureRow = {
	label: string | LaunchBlocking<string>;
	included: boolean;
};

export type Plan = {
	id: PlanId;
	name: string;
	price: PlanPrice;
	popular: boolean;
	ctaLabel: string;
	checkoutHref: string;
	features: PlanFeatureRow[];
};

// --- Unbacked feature rows -------------------------------------------
// The product is one MT5 Expert Advisor licensed by expiry date and
// issued by hand (PLANNING.md §8; CONTEXT.md — Robô). None of the rows
// below appear in any 0.1 or 1.0.0 milestone (PLANNING.md §10). Each ships
// behind launchBlocking with an owner decision attached: verify, scope, or
// delete. Defined once here and reused per plan below so the reason text
// isn't repeated three times over — the row's inclusion state still varies
// per plan, per the frame.

const cryptoMarketRow: LaunchBlocking<string> = launchBlocking(
	'Mercado de Criptomoedas',
	'Unbacked: the product is a single MT5 EA (CONTEXT.md — Robô) with no crypto-market ' +
		'support in any 0.1/1.0.0 milestone (PLANNING.md §10). Owner decision: verify, scope, ' +
		'or delete. .scratch/marketing-pages/issues/07-plans-page.md.',
);

const forexCryptoRow: LaunchBlocking<string> = launchBlocking(
	'Mercados Forex + Cripto',
	'Unbacked: no forex-plus-crypto market coverage exists in any 0.1/1.0.0 milestone ' +
		'(PLANNING.md §10). Owner decision: verify, scope, or delete. ' +
		'.scratch/marketing-pages/issues/07-plans-page.md.',
);

const allGlobalMarketsRow: LaunchBlocking<string> = launchBlocking(
	'Acesso a todos os mercados mundiais',
	'Unbacked: "all world markets" is broader than a single MT5 EA and appears in no ' +
		'0.1/1.0.0 milestone (PLANNING.md §10). Owner decision: verify, scope, or delete. ' +
		'.scratch/marketing-pages/issues/07-plans-page.md.',
);

const backtestingRow: LaunchBlocking<string> = launchBlocking(
	'Backtesting avançado de 5 anos, tick-by-tick',
	'Unbacked: no 5-year, tick-by-tick backtesting capability exists in any 0.1/1.0.0 ' +
		'milestone (PLANNING.md §10). Owner decision: verify, scope, or delete. ' +
		'.scratch/marketing-pages/issues/07-plans-page.md.',
);

const dedicatedManagerRow: LaunchBlocking<string> = launchBlocking(
	'Gerente de conta dedicado 24/7',
	'Unbacked: a 24/7 dedicated account manager is a staffing commitment, not copy, and ' +
		'is in no 0.1/1.0.0 milestone (PLANNING.md §10). Owner decision: verify, scope, or ' +
		'delete. .scratch/marketing-pages/issues/07-plans-page.md.',
);

const vpsIncludedRow: LaunchBlocking<string> = launchBlocking(
	'Servidor VPS de baixíssima latência incluso',
	'Unbacked: an included low-latency VPS is an infrastructure commitment, not copy, and ' +
		'is in no 0.1/1.0.0 milestone (PLANNING.md §10). Owner decision: verify, scope, or ' +
		'delete. .scratch/marketing-pages/issues/07-plans-page.md.',
);

const customApiRow: LaunchBlocking<string> = launchBlocking(
	'Integração via API Personalizada',
	'Unbacked: no custom API integration exists in any 0.1/1.0.0 milestone (PLANNING.md ' +
		'§10). Owner decision: verify, scope, or delete. ' +
		'.scratch/marketing-pages/issues/07-plans-page.md.',
);

const premiumSetupsRow: LaunchBlocking<string> = launchBlocking(
	'Acesso a setups premium validados',
	'Unbacked: "validated premium setups" implies a curated setup library that does not ' +
		'exist and is in no 0.1/1.0.0 milestone (PLANNING.md §10). Owner decision: verify, ' +
		'scope, or delete. .scratch/marketing-pages/issues/07-plans-page.md.',
);

// checkoutHref targets a checkout route that isn't built yet. Unlike the
// dead links in src/content/dead-links.ts (no destination anywhere in this
// scope, rendered inert), this is a real destination for a later ticket —
// ticket 07 explicitly allows "a checkout route that may be a stub". Not a
// dead link; leave the CTA as a normal <a>.
export const plans: Plan[] = [
	{
		id: 'starter',
		name: 'Starter',
		price: { monthly: 97, annual: null },
		popular: false,
		ctaLabel: 'Assinar Starter',
		checkoutHref: '/checkout?plan=starter',
		features: [
			{ label: 'Robô Trader para MetaTrader 5', included: true },
			{ label: 'Entrega por link de download seguro e expirável', included: true },
			// Entitlement copy ships exactly as sold (PLANNING.md §8; ticket
			// 07): nothing in 0.1 counts or caps either axis, and that gap is
			// accepted and recorded, not softened. Not launch-blocked.
			{ label: '1 Robô ativo simultâneo', included: true },
			{ label: '1 Corretora vinculada', included: true },
			{ label: cryptoMarketRow, included: false },
			{ label: forexCryptoRow, included: false },
			{ label: allGlobalMarketsRow, included: false },
			{ label: backtestingRow, included: false },
			{ label: dedicatedManagerRow, included: false },
			{ label: vpsIncludedRow, included: false },
			{ label: customApiRow, included: false },
			{ label: premiumSetupsRow, included: false },
		],
	},
	{
		id: 'pro',
		name: 'Pro',
		price: { monthly: 197, annual: null },
		popular: true,
		ctaLabel: 'Assinar Pro',
		checkoutHref: '/checkout?plan=pro',
		features: [
			{ label: 'Robô Trader para MetaTrader 5', included: true },
			{ label: 'Entrega por link de download seguro e expirável', included: true },
			{ label: '3 Robôs ativos simultâneos', included: true },
			{ label: '3 Corretoras vinculadas', included: true },
			{ label: cryptoMarketRow, included: false },
			{ label: forexCryptoRow, included: false },
			{ label: allGlobalMarketsRow, included: true },
			{ label: backtestingRow, included: false },
			{ label: dedicatedManagerRow, included: false },
			{ label: vpsIncludedRow, included: true },
			{ label: customApiRow, included: false },
			{ label: premiumSetupsRow, included: true },
		],
	},
	{
		id: 'enterprise',
		name: 'Enterprise',
		price: { monthly: 497, annual: null },
		popular: false,
		ctaLabel: 'Assinar Enterprise',
		checkoutHref: '/checkout?plan=enterprise',
		features: [
			{ label: 'Robô Trader para MetaTrader 5', included: true },
			{ label: 'Entrega por link de download seguro e expirável', included: true },
			{ label: 'Robôs ativos simultâneos ilimitados', included: true },
			{ label: 'Corretoras vinculadas ilimitadas', included: true },
			{ label: cryptoMarketRow, included: true },
			{ label: forexCryptoRow, included: true },
			{ label: allGlobalMarketsRow, included: true },
			{ label: backtestingRow, included: true },
			{ label: dedicatedManagerRow, included: true },
			{ label: vpsIncludedRow, included: true },
			{ label: customApiRow, included: true },
			{ label: premiumSetupsRow, included: true },
		],
	},
];

// ---------------------------------------------------------------------
// Regulatory note (frame 6:340) — real compliance copy, ships verbatim.
// Same register as `legalNotice` in src/content/footer.ts: the product
// does not manage funds or guarantee outcomes, and trading decisions and
// their results are the Cliente's own responsibility. Vocabulary follows
// CONTEXT.md (Robô, Cliente, Corretora, Assinatura).
// ---------------------------------------------------------------------

export const regulatoryNote =
	'Este site e o Robô Trader têm caráter exclusivamente informativo e de automação de ' +
	'ordens. Nada nesta página constitui recomendação de investimento, oferta de valores ' +
	'mobiliários, consultoria financeira ou sugestão de compra ou venda de qualquer ativo. A ' +
	'escolha da Corretora, a configuração dos parâmetros de risco e a decisão de contratar, ' +
	'manter ou cancelar a Assinatura são de responsabilidade exclusiva do Cliente. Resultados ' +
	'passados obtidos com qualquer configuração do Robô Trader não constituem garantia de ' +
	'resultados futuros — o Cliente é o único responsável pelas ordens enviadas à sua ' +
	'Corretora e pelos ganhos ou perdas delas decorrentes.';
