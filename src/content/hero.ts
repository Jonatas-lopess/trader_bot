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

// Headline — resolved by product decision, DECISIONS_temp.md §7. Replaces
// the "Resultados consistentes" wording flagged in
// .scratch/marketing-pages/issues/04-landing-hero.md item 1 (CDC art. 37 +
// payment-processor category risk, PLANNING.md §2, §12). No longer
// launch-blocking.
export const headline = 'Automação inteligente para operar o mercado financeiro com disciplina.';

// DECISIONS_temp.md §7.
export const supportingParagraph =
	'Nosso robô opera 24 horas por dia seguindo regras fixas, sem se deixar levar por ' +
	'impulso ou cansaço. Você define os parâmetros de risco e acompanha tudo de onde ' +
	'estiver, sem precisar ficar grudado na tela.';

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
