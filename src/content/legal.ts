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
		{ heading: 'Pagamento e renovação', body: placeholderBody('Termos de uso') },
		{ heading: 'Cancelamento', body: placeholderBody('Termos de uso') },
		{ heading: 'Alterações destes termos', body: placeholderBody('Termos de uso') },
		{ heading: 'Foro e legislação aplicável', body: placeholderBody('Termos de uso') },
	],
};

export const politicaDePrivacidade: LegalPage = {
	path: '/privacidade',
	pageTitle: 'Política de privacidade',
	pageDescription: 'Política de privacidade do Robô Trader.',
	heading: 'Política de privacidade',
	sections: [
		{ heading: 'Dados coletados', body: placeholderBody('Política de privacidade') },
		{ heading: 'Finalidade e base legal', body: placeholderBody('Política de privacidade') },
		{ heading: 'Compartilhamento com terceiros', body: placeholderBody('Política de privacidade') },
		{ heading: 'Retenção e exclusão', body: placeholderBody('Política de privacidade') },
		{ heading: 'Direitos do titular (LGPD)', body: placeholderBody('Política de privacidade') },
		{ heading: 'Cookies', body: placeholderBody('Política de privacidade') },
		{ heading: 'Contato do encarregado', body: placeholderBody('Política de privacidade') },
	],
};
