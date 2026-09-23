/**
 * Hero content — badge, headline, supporting paragraph, CTAs, trust row,
 * and the missing hero-visual asset note.
 *
 * See `docs/agents/content-files.md` for the typed-content-file and
 * launch-blocking conventions this follows, consumed by
 * `src/components/hero-section.astro`. Three items here are
 * launch-blocking per ticket
 * `.scratch/marketing-pages/issues/04-landing-hero.md` and
 * `.scratch/marketing-pages/spec.md` → "Carried by the tickets, not
 * resolved by them":
 *
 *   grep -rn "launchBlocking(" src/content/hero.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export type HeroCta = {
	label: string;
	href: string;
};

export type HeroTrustItem = {
	icon: 'shield-check' | 'badge-percent';
	label: string | LaunchBlocking<string>;
};

// "Nova Versão 2.4" — implies a release history nothing in the repo
// substantiates: no CHANGELOG, no version registry, no prior release to
// point to. .scratch/marketing-pages/issues/04-landing-hero.md item 2.
export const badge: LaunchBlocking<string> = launchBlocking(
	'Nova Versão 2.4',
	'Implies a release history nothing in the repo substantiates — no CHANGELOG, no ' +
		'version registry, no prior release to point to. ' +
		'.scratch/marketing-pages/issues/04-landing-hero.md item 2.',
);

// Headline — the highest-priority copy decision in this ticket. Ships as
// drawn in frame 6:18, wrapped and flagged. Rewriting it is the user's
// call, not the implementer's.
export const headline: LaunchBlocking<string> = launchBlocking(
	'Automação inteligente. Resultados consistentes no mercado financeiro.',
	'"Resultados consistentes" is a performance claim under CDC art. 37 (publicidade ' +
		"enganosa) and sits in the exact register PLANNING.md §2 names as payment-processor " +
		"category risk — Stripe's prohibited-business list covers services promising high " +
		'rewards, and this applies to any processor, not only the one chosen. Pagar.me ' +
		'onboarding approval of the business category is still an open prerequisite ' +
		'(PLANNING.md §12) — a trading-automation product discovered after the fact is how ' +
		'accounts get frozen with receivables inside. Do not rewrite without a product ' +
		'decision — PLANNING.md §2, §12; .scratch/marketing-pages/issues/04-landing-hero.md ' +
		'item 1.',
);

export const supportingParagraph =
	'O Robô opera 24 horas por dia nos mercados que você escolher, executando cada ordem ' +
	'com disciplina matemática inabalável — sem hesitação, sem cansaço e sem se desviar dos ' +
	'parâmetros de risco que você configurou.';

export const ctas: HeroCta[] = [
	{ label: 'Começar Agora', href: '/planos' },
	{ label: 'Ver Planos', href: '/planos' },
];

export const trustRow: HeroTrustItem[] = [
	{ icon: 'shield-check', label: 'Conexão API Segura' },
	{
		icon: 'badge-percent',
		// "Zero taxas ocultas" is a pricing claim; it only holds if the
		// plans page (ticket 07) ships with no surcharge on any payment
		// method. .scratch/marketing-pages/issues/04-landing-hero.md item 3.
		label: launchBlocking(
			'Zero taxas ocultas',
			'Pricing claim; holds only if the plans page (ticket 07) ships with no surcharge ' +
				'on any payment method. .scratch/marketing-pages/issues/04-landing-hero.md item 3; ' +
				'.scratch/marketing-pages/spec.md → "Carried by the tickets, not resolved by them".',
		),
	},
];

// hero-right (frame node 6:36) is an empty 600x400 rounded rectangle in
// Figma — there is no visual asset. Rendered as a token-styled
// placeholder box by src/components/hero-section.astro instead of a
// stock photo or a broken <img>. Missing-asset inventory:
// .scratch/marketing-pages/spec.md → "Carried by the tickets, not
// resolved by them" (hero visual, 6:36).
export const heroVisualPlaceholder = {
	label: 'Visual do produto — pendente',
	note: 'Missing asset: hero visual (frame 6:36). No screenshot/mock exists yet — do not fabricate one.',
} as const;
