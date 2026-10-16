/**
 * Copy for the own checkout page (`/checkout?robot=&offer=`, ADR-0007,
 * .scratch/appmax-checkout/issues/04-checkout-page-form.md). Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/checkout.astro`.
 */

export const pageTitle = 'Finalizar compra';
export const pageDescription = 'Informe seus dados e escolha como pagar o seu Robô.';

export const unavailable = {
	heading: 'Oferta indisponível',
	message: 'Esta oferta ainda não pode ser comprada por aqui. Escolha outra oferta no catálogo.',
	backLink: { label: 'Voltar ao catálogo', href: '/catalog' },
} as const;
