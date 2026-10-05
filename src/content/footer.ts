/**
 * Footer content — brand column, link columns, AVISO LEGAL disclaimer,
 * copyright line.
 *
 * See `docs/agents/content-files.md` for the typed content-file convention
 * this follows. Contato opens the support e-mail (`src/content/support.ts`).
 */

import { politicaDePrivacidade, termosDeUso } from './legal';
import { supportMailto } from './support';

export type FooterLink = {
	label: string;
	href: string;
};

export const footerBrand = {
	name: 'Robô Trader',
	tagline: 'Automação para o trader que já sabe operar.',
} as const;

export const usefulLinksHeading = 'Links Úteis';
export const supportLinksHeading = 'Suporte & Termos';

// These three DO have destinations in this scope — link them.
export const usefulLinks: FooterLink[] = [
	{ label: 'Como funciona', href: '/#como-funciona' },
	{ label: 'Catálogo & Preços', href: '/catalog' },
	{ label: 'FAQ', href: '/#faq' },
];

// Termos and Privacidade have routes (src/content/legal.ts); Contato is a mailto to the
// support address (src/content/support.ts).
export const supportLinks: FooterLink[] = [
	{ label: termosDeUso.pageTitle, href: termosDeUso.path },
	{ label: politicaDePrivacidade.pageTitle, href: politicaDePrivacidade.path },
	{ label: 'Contato', href: supportMailto() },
];

// AVISO LEGAL — real compliance copy, shipped verbatim on every page
// (ticket 03). Covers: past performance is not a guarantee of future
// results; trading carries risk of loss; the business does not manage
// funds or guarantee outcomes; the Cliente is responsible for their own
// trading decisions. Vocabulary follows CONTEXT.md (Robô, Cliente,
// Corretora) — the business sells the right to run the Robô and never
// holds or moves anyone's money.
export const legalNotice =
	'AVISO LEGAL: Operar no mercado financeiro envolve risco, incluindo a possibilidade de ' +
	'perda total do capital investido. Rentabilidade e desempenho passados do Robô Trader, de ' +
	'qualquer configuração sua ou de qualquer outra estratégia automatizada, não constituem ' +
	'garantia de resultados futuros. O Robô Trader é um programa de automação de ordens que ' +
	'roda na conta do Cliente junto à sua Corretora: nunca gerenciamos fundos de terceiros, ' +
	'nunca custodiamos ativos e não temos acesso nem autorização para movimentar o capital do ' +
	'Cliente. Não garantimos lucro, rentabilidade ou ausência de perdas. A escolha da ' +
	'Corretora, a configuração dos parâmetros de risco, a decisão de manter o Robô Trader em ' +
	'execução e cada ordem por ele enviada são de responsabilidade exclusiva do Cliente. As ' +
	'informações deste site têm caráter informativo e não constituem recomendação de ' +
	'investimento, análise de valores mobiliários ou consultoria financeira.';

// Close button on the legal modals shown by the account shell (src/components/legal-dialog.astro).
export const legalDialogCloseLabel = 'Fechar';

export const copyright = (year: number): string => `© ${year} Robô Trader. Todos os direitos reservados.`;
