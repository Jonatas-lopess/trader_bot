/**
 * Copy for `/encomenda` — .scratch/storefront-v2/issues/14-encomenda-page.md, CONTEXT.md
 * (Encomenda: a request for a custom Robô, no price, no payment). Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/encomenda.astro` (the page script gets
 * the error and status copy as JSON) and by `modules/orders/encomenda.ts` (WhatsApp summary,
 * operator e-mail).
 *
 * Everything the owner has not approved is wrapped in `launchBlocking`: the form copy, the
 * LGPD consent line and the WhatsApp number are placeholders until supplied.
 */

import { launchBlocking } from '../shared/launch-blocking';
import type { EncomendaFieldError } from '../modules/orders/encomenda';

export const pageTitle = 'Encomenda de Robô';
export const pageDescription = 'Peça um Robô sob medida para a sua estratégia no MetaTrader 5.';

export const heading = 'Encomende um Robô sob medida';
export const intro = launchBlocking(
	'Descreva a estratégia que você opera e retornamos com uma proposta. Este formulário não gera cobrança nem cria conta.',
	'Placeholder copy: the Encomenda page text is not owner-approved (storefront-v2 spec, open with the owner)'
);

export type FieldCopy = { label: string; hint?: string };

export const fields = {
	name: { label: 'Nome' },
	email: { label: 'E-mail' },
	phone: { label: 'Telefone / WhatsApp', hint: 'Com DDD. Informe o e-mail, o telefone ou os dois.' },
	strategy: {
		label: 'Descrição da estratégia',
		hint: 'Quando entrar, quando sair, indicadores, horários, gestão de risco.',
	},
	market: { label: 'Mercado', hint: 'Opcional. Ex.: mini índice, mini dólar, forex.' },
	corretora: { label: 'Corretora', hint: 'Opcional. A corretora em que o Robô vai rodar.' },
} satisfies Record<string, FieldCopy>;

export const consentLabel = launchBlocking(
	'Concordo em ser contatado por e-mail ou telefone sobre esta encomenda e em que meus dados sejam usados para esse fim.',
	'Placeholder LGPD consent line: wording must come from the owner or a lawyer, together with the privacy policy (PLANNING.md §9)'
);

export const submitLabel = 'Enviar encomenda';
export const submittingLabel = 'Enviando…';

/** Inline error per field code; the script fills the matching `<p>` and moves focus to the first field in error. */
export const fieldErrors: Record<EncomendaFieldError, string> = {
	name_invalid: 'Informe seu nome.',
	email_invalid: 'Esse e-mail não parece válido.',
	phone_invalid: 'Informe o telefone com DDD, por exemplo (11) 91234-5678.',
	contact_required: 'Informe um e-mail ou um telefone para retornarmos o contato.',
	strategy_invalid: 'Descreva a estratégia com alguns detalhes (de 10 a 2.000 caracteres).',
	market_invalid: 'Esse campo aceita até 100 caracteres.',
	corretora_invalid: 'Esse campo aceita até 100 caracteres.',
	consent_required: 'Marque o consentimento para podermos entrar em contato.',
};

export const formErrorSummary = 'Revise os campos indicados abaixo.';
export const rateLimitedMessage = 'Muitas tentativas em pouco tempo. Aguarde um minuto e envie novamente.';
export const serverErrorMessage = 'Não foi possível enviar agora. Tente novamente em instantes.';

export const successHeading = 'Encomenda recebida';
export const successMessage = launchBlocking(
	'Recebemos sua descrição e vamos entrar em contato. Se preferir adiantar a conversa, continue pelo WhatsApp.',
	'Placeholder copy: the Encomenda confirmation text is not owner-approved (storefront-v2 spec, open with the owner)'
);
export const whatsappLinkLabel = 'Continuar no WhatsApp';

/**
 * No-JS fallback (`/encomenda/resultado`): a plain form post lands on this page, success or error.
 * Field errors reuse `fieldErrors`; the codes below cover failures that are not a field.
 */
export const resultPageTitle = 'Resultado da encomenda';
export const resultErrorHeading = 'Não foi possível enviar a encomenda';
export const backToFormLabel = 'Voltar ao formulário';
export const resultErrorCodes = {
	'rate-limited': rateLimitedMessage,
	server: serverErrorMessage,
} as const;

/** WhatsApp number (digits, country code first) used until the `WHATSAPP_NUMBER` setting is set. */
export const whatsappNumber = launchBlocking(
	'5500000000000',
	'Placeholder WhatsApp number: the owner has not supplied the real number; the WHATSAPP_NUMBER setting overrides this (storefront-v2 spec, open with the owner)'
);

/** Prefilled WhatsApp message; the lines for blank optional fields are left out. */
export const whatsappSummary = {
	intro: 'Olá! Acabei de enviar uma encomenda de Robô pelo site.',
	name: 'Nome',
	market: 'Mercado',
	corretora: 'Corretora',
	strategy: 'Estratégia',
};

/** Operator e-mail: a fixed subject plus the lead id, and a plain-text body. */
export const operatorEmail = {
	subjectPrefix: 'Nova Encomenda de Robô',
	bodyIntro: 'Nova Encomenda recebida pelo site. Responda a este e-mail para falar com o solicitante.',
	labels: {
		id: 'Código',
		name: 'Nome',
		email: 'E-mail',
		phone: 'Telefone / WhatsApp',
		market: 'Mercado',
		corretora: 'Corretora',
		strategy: 'Estratégia',
	},
	noEmail: '(não informado; contato apenas por telefone)',
	noPhone: '(não informado)',
	blank: '(em branco)',
};
