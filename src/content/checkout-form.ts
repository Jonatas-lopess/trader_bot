/**
 * Copy for the own checkout page (`/checkout?robot=&offer=`, ADR-0007,
 * .scratch/appmax-checkout/issues/04-checkout-page-form.md). Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/checkout.astro` and its browser script
 * (`src/shared/checkout-form.ts`). Error copy is keyed by the stable codes of
 * `modules/billing/buyer-input.ts` and `modules/billing/pay.ts`; the codes never carry text.
 */

import type { BuyerField, FieldErrorCode } from '../modules/billing/buyer-input';
import type { PayFailureCode } from '../modules/billing/pay';
import type { PaymentMethod } from '../modules/billing/payment-provider';
import type { OfferName } from '../modules/catalog/robots';
import { launchBlocking } from '../shared/launch-blocking';
import { buyWithdrawalNote, formatBrl, offerLabels } from './catalog-page';
import { supportEmail } from './support';

export const pageTitle = 'Finalizar compra';
export const pageDescription = 'Informe seus dados e escolha como pagar o seu Robô.';
export const heading = 'Finalizar compra';

// Prices and Oferta names are the catalog's own (one source, catalog-page.ts).
export { formatBrl };
export const checkoutOfferLabels: Record<OfferName, string> = offerLabels;

export const summary = {
	heading: 'Resumo da compra',
	linesLabel: 'Robôs e Licenças',
	totalLabel: 'Total',
	/** Under each Robô's name: the Oferta and how many Licenças (one per Corretora account, ADR-0008). */
	lineDetail: (offerLabel: string, quantity: number): string =>
		`${offerLabel} · ${quantity} ${quantity === 1 ? 'licença' : 'licenças'}`,
} as const;

export const buyerHeading = 'Seus dados';
export const buyerIntro = 'Usamos estes dados para emitir a nota fiscal e enviar o acesso por e-mail.';

export const buyerFields: Record<BuyerField, { label: string; hint?: string }> = {
	name: { label: 'Nome completo' },
	email: { label: 'E-mail', hint: 'O acesso à área do cliente chega neste e-mail.' },
	phone: { label: 'Telefone', hint: 'Com DDD.' },
	document: { label: 'CPF ou CNPJ' },
};

export const fieldErrors: Record<FieldErrorCode, string> = {
	name_invalid: 'Informe nome e sobrenome.',
	email_invalid: 'Informe um e-mail válido.',
	phone_invalid: 'Informe um telefone com DDD, só números ou com máscara.',
	document_invalid: 'Informe um CPF ou CNPJ válido.',
	document_alphanumeric: `CNPJ com letras ainda não é aceito aqui. Escreva para ${supportEmail.value} e finalizamos a compra com você.`,
};

export const formErrorSummary = 'Confira os campos destacados.';

export const methodHeading = 'Forma de pagamento';

// An approval-time claim: unverified until the sandbox run (appmax-checkout 08).
export const cardAnalysisNote = launchBlocking(
	'Depois do pagamento, a análise do cartão pode levar alguns minutos. Avisamos por e-mail.',
	'Approval-time claim for card antifraud review (`autorizado`, PLANNING.md §13); not sandbox-verified (appmax-checkout 08, ADR-0007).'
);

// Same kind of approval-time claim, for Boleto compensation.
export const boletoConfirmationNote = launchBlocking(
	'A confirmação do Boleto pode levar até 1 dia útil depois do pagamento. O acesso chega por e-mail.',
	'Approval-time claim for Boleto compensation (PLANNING.md §7 "up to one business day"); not sandbox-verified (appmax-checkout 08, ADR-0007).'
);

export const methods: Record<PaymentMethod, { label: string; note: string }> = {
	pix: {
		label: 'Pix',
		note: 'Na próxima tela você recebe o QR Code e o código copia e cola. O código tem prazo para ser pago.',
	},
	boleto: { label: 'Boleto', note: boletoConfirmationNote.value },
	card: { label: 'Cartão de crédito', note: cardAnalysisNote.value },
};

export const cardHeading = 'Dados do cartão';
export const cardFields = {
	number: 'Número do cartão',
	holderName: 'Nome impresso no cartão',
	expMonth: 'Mês de validade',
	expYear: 'Ano de validade',
	cvv: 'Código de segurança (CVV)',
} as const;

// PCI posture of ADR-0007: true by construction (Appmax JS tokenizes in the browser), but a
// security reassurance shown to buyers, so it waits for the pre-launch review.
export const securityNote = launchBlocking(
	'Os dados do seu cartão vão direto para a Appmax e não passam pelos nossos servidores.',
	'Security reassurance (ADR-0007 browser tokenization, PLANNING.md §6); wording needs the pre-launch review.'
);

// Same statement as the catalog card, so the wording is decided once (withdrawal-guarantee 03).
export const withdrawalNote = buyWithdrawalNote;

export const payLabel = 'Pagar';
export const payingLabel = 'Processando…';

/** Errors the page shows in its top error region, keyed by `pay.ts`'s codes plus the page's own. */
export type PayErrorCode =
	| Exclude<PayFailureCode, 'invalid_buyer'>
	| 'card_declined'
	| 'provider_unavailable'
	| 'rate_limited'
	| 'tokenization_failed'
	| 'network';

export const payErrors: Record<PayErrorCode, string> = {
	card_declined: 'O pagamento com cartão não foi autorizado. Confira os dados ou tente outro cartão ou forma de pagamento.',
	tokenization_failed: 'Não conseguimos validar os dados do cartão. Confira os campos do cartão e tente de novo.',
	provider_unavailable: 'Não conseguimos falar com o meio de pagamento agora. Tente de novo em alguns instantes.',
	rate_limited: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
	network: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
	invalid_request: 'Não conseguimos processar o pagamento. Recarregue a página e tente de novo.',
	unknown_offer: 'Esta oferta não está mais disponível. Volte ao catálogo e escolha de novo.',
	offer_not_supported: 'Esta oferta ainda não pode ser comprada por aqui. Volte ao catálogo e escolha outra.',
	method_not_allowed: 'Esta forma de pagamento não está disponível para esta oferta.',
	token_required: 'Não conseguimos validar os dados do cartão. Confira os campos do cartão e tente de novo.',
};

export const unavailable = {
	heading: 'Oferta indisponível',
	message: 'Esta oferta ainda não pode ser comprada por aqui. Escolha outra oferta no catálogo.',
	backLink: { label: 'Voltar ao catálogo', href: '/catalog' },
} as const;

// Only the Stripe test driver (ADR-0005, never deployed) cannot take a cart of several Licenças.
export const cartUnavailable = {
	heading: 'Carrinho indisponível',
	message: 'Este ambiente de teste aceita só um item por compra. Deixe um item no carrinho ou compre um de cada vez.',
	backLink: { label: 'Voltar ao carrinho', href: '/carrinho' },
} as const;
