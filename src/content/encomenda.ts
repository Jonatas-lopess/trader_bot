/**
 * Copy for `/encomenda` — .scratch/storefront-v2/issues/14-encomenda-page.md, widened by
 * .scratch/storefront-v2/issues/17-generalize-encomenda.md; CONTEXT.md (Encomenda: a request for
 * custom work, whether a new Robô, an adjustment to a Robô or something else; no price, no
 * payment). The form's fields and their keys are unchanged (`strategy` is the main free text,
 * now "what you want"). Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/encomenda.astro` (the page script gets
 * the error and status copy as JSON) and by `modules/orders/encomenda.ts` (WhatsApp summary,
 * operator e-mail).
 *
 * Everything the owner has not approved is wrapped in `launchBlocking`: the form copy, the
 * LGPD consent line and the WhatsApp number are placeholders until supplied.
 */

import { launchBlocking } from '../shared/launch-blocking';
import type { EncomendaFieldError } from '../modules/orders/encomenda';

const pageCopyReason =
	'Placeholder copy: the Encomenda page text, widened beyond new Robôs, is not owner-approved (storefront-v2 17, open with the owner)';

export const pageTitle = launchBlocking('Encomenda sob medida', pageCopyReason);
export const pageDescription = launchBlocking(
	'Peça um Robô novo, um ajuste em um Robô que você já usa ou outro trabalho sob medida.',
	pageCopyReason
);

export const heading = launchBlocking('Encomende um trabalho sob medida', pageCopyReason);
export const intro = launchBlocking(
	'Pode ser um Robô novo, um ajuste em um Robô que você já usa ou outro trabalho sob medida. Conte o que você precisa e retornamos com uma proposta. Este formulário não gera cobrança nem cria conta.',
	pageCopyReason
);

const mainTextLabel = launchBlocking('O que você precisa', pageCopyReason);
const mainTextHint = launchBlocking(
	'Para um Robô novo, descreva a estratégia: quando entrar e sair, indicadores, horários, gestão de risco. Para um ajuste, diga qual Robô e o que mudar.',
	pageCopyReason
);
const marketHint = launchBlocking('Opcional. O mercado em que você opera ou quer operar. Ex.: mini índice, mini dólar, forex.', pageCopyReason);
const corretoraHint = launchBlocking('Opcional. A corretora em que você opera ou quer operar.', pageCopyReason);

export type FieldCopy = { label: string; hint?: string };

export const fields = {
	name: { label: 'Nome' },
	email: { label: 'E-mail' },
	phone: { label: 'Telefone / WhatsApp', hint: 'Com DDD. Informe o e-mail, o telefone ou os dois.' },
	strategy: { label: mainTextLabel.value, hint: mainTextHint.value },
	market: { label: 'Mercado', hint: marketHint.value },
	corretora: { label: 'Corretora', hint: corretoraHint.value },
} satisfies Record<string, FieldCopy>;

export const consentLabel = launchBlocking(
	'Concordo em ser contatado por e-mail ou telefone sobre o que descrevi neste formulário e em que meus dados sejam usados para esse fim.',
	'Placeholder LGPD consent line: wording must come from the owner or a lawyer, together with the privacy policy (PLANNING.md §9)'
);

export const submitLabel = 'Enviar encomenda';
export const submittingLabel = 'Enviando…';

const mainTextInvalid = launchBlocking('Conte o que você precisa com alguns detalhes (de 10 a 2.000 caracteres).', pageCopyReason);

/** Inline error per field code; the script fills the matching `<p>` and moves focus to the first field in error. */
export const fieldErrors: Record<EncomendaFieldError, string> = {
	name_invalid: 'Informe seu nome.',
	email_invalid: 'Esse e-mail não parece válido.',
	phone_invalid: 'Informe o telefone com DDD, por exemplo (11) 91234-5678.',
	contact_required: 'Informe um e-mail ou um telefone para retornarmos o contato.',
	strategy_invalid: mainTextInvalid.value,
	market_invalid: 'Esse campo aceita até 100 caracteres.',
	corretora_invalid: 'Esse campo aceita até 100 caracteres.',
	consent_required: 'Marque o consentimento para podermos entrar em contato.',
};

export const formErrorSummary = 'Revise os campos indicados abaixo.';
export const rateLimitedMessage = 'Muitas tentativas em pouco tempo. Aguarde um minuto e envie novamente.';
export const serverErrorMessage = 'Não foi possível enviar agora. Tente novamente em instantes.';

export const successHeading = 'Encomenda recebida';
export const successMessage = launchBlocking(
	'Recebemos sua mensagem e vamos entrar em contato com uma proposta. Se preferir adiantar a conversa, continue pelo WhatsApp.',
	'Placeholder copy: the Encomenda confirmation text is not owner-approved (storefront-v2 17, open with the owner)'
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

/**
 * Prefilled WhatsApp message, sent by the visitor; the lines for blank optional fields are left
 * out. `strategy` labels the main free text ("what you want").
 */
export const whatsappSummary = {
	intro: launchBlocking('Olá! Acabei de enviar uma encomenda pelo site.', pageCopyReason),
	name: 'Nome',
	market: 'Mercado',
	corretora: 'Corretora',
	strategy: 'O que preciso',
};

/**
 * Operator e-mail: a fixed subject plus the lead id, and a plain-text body. Read only by the
 * operator, so not launch-blocking. Nothing here checks that the sender owns a Robô they name.
 */
export const operatorEmail = {
	subjectPrefix: 'Nova Encomenda',
	bodyIntro:
		'Nova Encomenda recebida pelo site (Robô novo, ajuste em um Robô ou outro trabalho). Responda a este e-mail para falar com o solicitante.',
	labels: {
		id: 'Código',
		name: 'Nome',
		email: 'E-mail',
		phone: 'Telefone / WhatsApp',
		market: 'Mercado',
		corretora: 'Corretora',
		strategy: 'O que precisa',
	},
	noEmail: '(não informado; contato apenas por telefone)',
	noPhone: '(não informado)',
	blank: '(em branco)',
};
