/**
 * Copy for the admin area (`/admin`) — .scratch/storefront-v2/issues/04-admin-gate.md, ADR-0008.
 * Internal screens for the operators, so no launch-blocking marking. Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/admin.astro` and
 * `src/components/admin-header.astro`.
 *
 * Tickets 05 (catalog) and 16 (dead letters) add their pages by appending to `adminSections`:
 * the header nav and the landing's link list both read it, so one entry wires both.
 */

export type AdminLink = { label: string; href: string; description: string };

export const pageTitle = 'Administração';
export const pageDescription = 'Área restrita para gerenciar o catálogo e a operação.';

export const adminAreaLabel = 'Administração';
export const navLabel = 'Navegação da administração';
export const logoutLabel = 'Sair';

export const heading = 'Administração';
export const signedInAs = (email: string) => `Conectado como ${email}`;

export const homeLink = { label: 'Início', href: '/admin' } as const;

export const sectionsHeading = 'Atalhos';
export const adminSections: AdminLink[] = [
	{ label: 'E-mails com falha', href: '/admin/emails', description: 'Mensagens que não foram enviadas e podem ser reenviadas.' },
	{ label: 'Catálogo público', href: '/catalog', description: 'Como os Robôs aparecem para os visitantes.' },
	{ label: 'Área do cliente', href: '/conta', description: 'A visão de um Cliente com Licenças.' },
];

/** The unresolved dead-letter count on the landing (`/admin`), linking to the list. */
export const deadLettersCount = (count: number) =>
	count === 0 ? 'Nenhum e-mail com falha pendente' : count === 1 ? '1 e-mail com falha pendente' : `${count} e-mails com falha pendentes`;

/** `/admin/emails` — unresolved and resolved dead letters (storefront-v2 16). */
export const emails = {
	pageTitle: 'E-mails com falha',
	pageDescription: 'E-mails que o Resend recusou e ficaram guardados para reenvio.',
	heading: 'E-mails com falha',
	intro: 'Cada item é uma mensagem que não saiu. Reenvie depois de corrigir a causa; o motivo é o que o Resend respondeu.',
	unresolvedHeading: 'Pendentes',
	resolvedHeading: 'Resolvidos',
	emptyUnresolved: 'Nenhum e-mail pendente.',
	emptyResolved: 'Nenhum e-mail resolvido ainda.',
	columns: { kind: 'Tipo', recipient: 'Destinatário', subject: 'Assunto', age: 'Há', attempts: 'Tentativas', error: 'Motivo' },
	resendLabel: 'Reenviar',
	notResendable: 'Sem corpo guardado; não pode ser reenviado.',
	resolvedAtLabel: 'Resolvido',
	flash: {
		ok: 'E-mail reenviado.',
		failed: 'O Resend recusou o reenvio de novo; o motivo foi atualizado.',
		busy: 'Houve uma tentativa agora há pouco; aguarde alguns segundos.',
		'already-resolved': 'Esse e-mail já foi reenviado.',
		'no-body': 'Esse e-mail foi guardado sem corpo e não pode ser reenviado.',
		'not-found': 'E-mail não encontrado.',
	},
} as const;

export type EmailsFlashKey = keyof typeof emails.flash;

/** A coarse, pt-BR age for the list: "menos de 1 min", "5 min", "3 h", "2 d". */
export function ageLabel(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return 'menos de 1 min';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} h`;
	return `${Math.floor(hours / 24)} d`;
}
