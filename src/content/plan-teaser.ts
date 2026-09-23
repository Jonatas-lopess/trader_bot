/**
 * Plan-teaser content — badge, heading, and the three condensed plan cards
 * on the landing page's `quick-comparison` band (frame `6:121`,
 * `.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md`).
 *
 * See `docs/agents/content-files.md` for the typed-content-file convention
 * this follows, consumed by `src/components/plan-teaser.astro`.
 *
 * Per `docs/agents/content-files.md` → "Facts shared across pages": prices
 * and entitlements are the same facts `/planos` sells (ticket 07,
 * `src/content/plans.ts`). This file imports them rather than duplicating —
 * a second copy of a price is how the two pages end up disagreeing the
 * first time it moves.
 *
 * "Headline entitlement" derivation: the ticket asks for one entitlement
 * per plan and gives "Robôs ativos simultâneos" as the example, rather than
 * inventing new copy. `headlineEntitlement` below derives that
 * mechanically instead of hardcoding a row index or new text: it walks
 * each plan's `features` and skips any row that is (a) launch-blocked
 * (fabricated/unbacked — see `plans.ts`), (b) not included on that plan, or
 * (c) present with the same label text on all three plans (the shared
 * "this is an MT5 EA, delivered by download link" rows aren't a
 * differentiator). Matching is by label text, not array position, so
 * reordering or adding a plan-specific row in `plans.ts` can't silently
 * misalign the comparison. The first row left standing is the plan's
 * actual point of difference — which lands on the "N Robôs ativos
 * simultâneos" row for all three plans, matching the ticket's own example.
 */

import { plans, type Plan, type PlanId, type PlanPrice } from './plans';

// Label text present, verbatim, in every plan's feature list — computed
// once by content equality, not by row index, so a later reorder or a
// plan-specific insertion in `plans.ts` doesn't misalign the comparison.
const sharedFeatureLabels: ReadonlySet<string> = (() => {
	const [first, ...rest] = plans;
	const candidateLabels = first.features
		.map((row) => row.label)
		.filter((label): label is string => typeof label === 'string');

	return new Set(
		candidateLabels.filter((label) =>
			rest.every((plan) => plan.features.some((row) => row.label === label)),
		),
	);
})();

export const badge = 'Planos Simplificados';

export const heading = 'Comece no seu ritmo';

export const ctaLabel = 'Ver planos completos';

export const ctaHref = '/planos';

export type TeaserCard = {
	id: PlanId;
	name: string;
	price: PlanPrice;
	popular: boolean;
	headlineEntitlement: string;
};

const deriveHeadlineEntitlement = (plan: Plan): string => {
	const row = plan.features.find((candidate) => {
		if (!candidate.included || typeof candidate.label !== 'string') {
			// Excludes launch-blocked rows (LaunchBlocking wrapper, not a
			// plain string) and anything not actually included on this plan.
			return false;
		}
		return !sharedFeatureLabels.has(candidate.label);
	});

	if (!row || typeof row.label !== 'string') {
		throw new Error(`plan-teaser: no headline entitlement could be derived for plan "${plan.id}"`);
	}

	return row.label;
};

export const teaserCards: TeaserCard[] = plans.map((plan) => ({
	id: plan.id,
	name: plan.name,
	price: plan.price,
	popular: plan.popular,
	headlineEntitlement: deriveHeadlineEntitlement(plan),
}));
