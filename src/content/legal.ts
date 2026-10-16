/**
 * Legal pages — Termos de uso (/termos-de-uso) and Política de privacidade
 * (/privacidade).
 *
 * Structure only. PLANNING.md §9: real text comes from the owner or a lawyer;
 * generated legal copy is a liability. Every section body is a placeholder
 * wrapped in `launchBlocking` so the pre-launch pass finds it with
 * `grep -rn "launchBlocking(" src/content/`.
 *
 * See `docs/agents/content-files.md` for the content-file and marker
 * conventions.
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export type LegalSection = {
	heading: string;
	/** Fragment id on the rendered page; set only on sections other pages link to. */
	id?: string;
	body: LaunchBlocking<string>;
};

export type LegalPage = {
	path: string;
	pageTitle: string;
	pageDescription: string;
	heading: string;
	sections: LegalSection[];
};

const placeholderBody = (page: string) =>
	launchBlocking(
		'TODO — texto definitivo pendente de revisão jurídica.',
		`Placeholder — ${page} text must come from the owner or a lawyer (PLANNING.md §9, §10 0.1 scope)`,
	);

// CDC art. 49 (7-day arrependimento) — ADR-0006 "Withdrawal", PLANNING.md §9.
// Honored in 0.1 by manual refund via Appmax; the Licença is revoked by expiry-to-now
// (docs/ops/withdrawal-refund.md). Wording below is a placeholder: a lawyer writes the real clause.
export const withdrawalHeading = 'Direito de arrependimento';
// Anchor of the clause on /termos-de-uso (rendered as the section's `id` by legal-page.astro).
// The catalog, FAQ, paid confirmation and footer all link to it (withdrawal-guarantee 03).
export const withdrawalAnchor = 'direito-de-arrependimento';
export const withdrawalBody = launchBlocking(
	'TODO — cláusula de arrependimento (CDC art. 49, 7 dias, reembolso e revogação da Licença) pendente de redação jurídica.',
	'Placeholder — CDC art. 49 withdrawal clause must be worded by a lawyer (ADR-0006 Withdrawal, PLANNING.md §9)',
);

// The own checkout (ADR-0007): payment is taken by Appmax on our page, with the buyer data above.
const pagamentoBody = launchBlocking(
	'TODO — cláusula de pagamento pendente de redação jurídica: pagamento processado pela Appmax no checkout do site (cartão, Pix ou Boleto), dados pedidos no checkout (nome, e-mail, telefone, CPF ou CNPJ e endereço IP) e sua finalidade.',
	'Placeholder — Termos payment clause must come from the owner or a lawyer (PLANNING.md §9); must name the data the own checkout collects (ADR-0007, appmax-checkout 04)',
);

export const termosDeUso: LegalPage = {
	path: '/termos-de-uso',
	pageTitle: 'Termos de uso',
	pageDescription: 'Termos de uso do Robô Trader.',
	heading: 'Termos de uso',
	sections: [
		{ heading: 'Escopo do serviço', body: placeholderBody('Termos de uso') },
		{ heading: 'Licença de uso do Robô', body: placeholderBody('Termos de uso') },
		{ heading: 'Responsabilidades do Cliente', body: placeholderBody('Termos de uso') },
		{ heading: 'Limitação de responsabilidade', body: placeholderBody('Termos de uso') },
		{ heading: 'Pagamento e renovação', body: pagamentoBody },
		{ heading: 'Cancelamento', body: placeholderBody('Termos de uso') },
		{ heading: withdrawalHeading, id: withdrawalAnchor, body: withdrawalBody },
		{ heading: 'Alterações destes termos', body: placeholderBody('Termos de uso') },
		{ heading: 'Foro e legislação aplicável', body: placeholderBody('Termos de uso') },
	],
};

/** Link target for every "7 dias para desistir da compra" statement. */
export const withdrawalHref = `${termosDeUso.path}#${withdrawalAnchor}`;

// Includes the Encomenda data (storefront-v2 14): name, e-mail and/or phone, the strategy text,
// market and Corretora, stored in `custom_orders` and e-mailed to the operator, collected on
// the basis of the contact consent ticked on /encomenda. And the own checkout's data (ADR-0007,
// appmax-checkout 04): name, e-mail, phone, CPF/CNPJ and the client IP, sent to Appmax to take
// the payment; name and CPF/CNPJ are also kept on the purchase for the NFS-e. Card data is
// tokenized by Appmax JS in the browser and never stored by us.
const dadosColetadosBody = launchBlocking(
	'TODO — dados coletados pendentes de redação jurídica, incluindo os dados do checkout (nome, e-mail, telefone, CPF ou CNPJ e endereço IP, compartilhados com a Appmax para processar o pagamento; nome e CPF/CNPJ guardados para a nota fiscal; dados do cartão tratados só pela Appmax), os dados da Encomenda (nome, e-mail ou telefone, descrição da estratégia, mercado e Corretora), seu prazo de retenção e a forma de exclusão.',
	'Placeholder — privacy text must come from the owner or a lawyer (PLANNING.md §9); must cover the checkout data sent to Appmax and kept for the NFS-e (ADR-0007, appmax-checkout 04) and the Encomenda data stored in custom_orders (storefront-v2 14, ADR-0008)',
);

export const politicaDePrivacidade: LegalPage = {
	path: '/privacidade',
	pageTitle: 'Política de privacidade',
	pageDescription: 'Política de privacidade do Robô Trader.',
	heading: 'Política de privacidade',
	sections: [
		{ heading: 'Dados coletados', body: dadosColetadosBody },
		{ heading: 'Finalidade e base legal', body: placeholderBody('Política de privacidade') },
		{ heading: 'Compartilhamento com terceiros', body: placeholderBody('Política de privacidade') },
		{ heading: 'Retenção e exclusão', body: placeholderBody('Política de privacidade') },
		{ heading: 'Direitos do titular (LGPD)', body: placeholderBody('Política de privacidade') },
		{ heading: 'Cookies', body: placeholderBody('Política de privacidade') },
		{ heading: 'Contato do encarregado', body: placeholderBody('Política de privacidade') },
	],
};
