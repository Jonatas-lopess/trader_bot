/**
 * Transactional e-mail copy — the magic-link login and the Robô download link.
 *
 * Content lives here, not inline in the Resend clients (PLANNING.md §2). Rendered by
 * `src/shared/email-template.ts`, sent by `src/modules/identity/resend-client.ts` and
 * `src/modules/licensing/resend-client.ts`. See `docs/agents/content-files.md`.
 */

import { brand } from './header';
import { supportEmail } from './support';

export type EmailContent = {
	subject: string;
	/** Hidden inbox-preview line shown next to the subject. */
	preheader: string;
	heading: string;
	paragraphs: string[];
	cta: string;
	/** Fine print under the button: expiry and single-use rules. */
	note: string;
	/** Text above the raw URL fallback, for clients that strip buttons. */
	fallback: string;
	/** Closing line above the support contact. */
	disclaimer: string;
};

export const emailBrand = brand.name;

export const emailFooter = {
	support: 'Precisa de ajuda? Fale com o suporte em',
	supportEmail: supportEmail.value,
} as const;

export const magicLinkEmail: EmailContent = {
	subject: 'Seu link de acesso — Robô Trader',
	preheader: 'Entre na sua área do cliente. O link expira em 15 minutos.',
	heading: 'Acesse sua área do cliente',
	paragraphs: ['Clique no botão abaixo para entrar na sua área do cliente e acessar seus Robôs e licenças.'],
	cta: 'Entrar na minha conta',
	note: 'O link expira em 15 minutos e só pode ser usado uma vez.',
	fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
	disclaimer: 'Se você não pediu este acesso, ignore este e-mail.',
};

export const downloadLinkEmail: EmailContent = {
	subject: 'Seu Robô Trader está pronto para baixar',
	preheader: 'Baixe o seu Robô agora. O link expira em 48 horas.',
	heading: 'Seu Robô está pronto',
	paragraphs: ['Sua licença foi ativada. Clique no botão abaixo para baixar o seu Robô Trader.'],
	cta: 'Baixar meu Robô',
	note: 'O link expira em 48 horas e pode ser usado mais de uma vez dentro desse prazo.',
	fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
	disclaimer: 'Você recebeu este e-mail porque ativou uma licença do Robô Trader.',
};
