/**
 * Copy for `/conta`, the customer-area page —
 * .scratch/customer-area/issues/03-license-status-page.md, PLANNING.md §8.
 * Real product copy, ships as drawn (docs/agents/content-files.md).
 */

import { LIFETIME_EXPIRY } from '../modules/licensing/license-expiry';
import type { LicenseStatus } from '../modules/licensing/license-status';
import { launchBlocking } from '../shared/launch-blocking';
import type { PurchaseStatus } from '../modules/identity/customers';

export const pageTitle = 'Sua conta';
export const pageDescription = 'Acompanhe o status da sua Licença e, na Oferta Mensal, gerencie sua Assinatura.';

export const heading = 'Sua conta';
export const licenseLabel = 'Licença';
export const assinaturaLabel = 'Assinatura';

// Ticket 04 (.scratch/customer-area/issues/04-cancel-subscription.md): the
// page needs to reflect the Assinatura's own status too, not only the
// Licença's — most visibly after a successful cancel.
// Paid but held for manual review (PLANNING.md §6 Price integrity). Says the payment was
// received, never that the Cliente was not charged, and never invites a second purchase.
// Both are `launchBlocking` because PLANNING.md §6 marks all price-integrity copy as
// awaiting launch approval.
const rejectedStatusText = launchBlocking(
	'Pagamento recebido, em análise',
	'PLANNING.md §6 Price integrity: copy for a paid-but-rejected purchase awaits launch approval.'
);
export const rejectedNoticeText = launchBlocking(
	'Recebemos seu pagamento e ele está em análise pela nossa equipe. Entraremos em contato por e-mail. Não é necessário comprar novamente.',
	'PLANNING.md §6 Price integrity: copy for a paid-but-rejected purchase awaits launch approval.'
);

export const assinaturaStatusTexts: Record<PurchaseStatus, string> = {
	pending: 'Pendente',
	active: 'Ativa',
	past_due: 'Pagamento atrasado',
	canceled: 'Cancelada',
	rejected: rejectedStatusText.value,
	refunded: 'Reembolsada',
	chargeback: 'Contestada',
};

export const licenseLifetimeText = 'Vitalícia';
export const licensePreparingText = 'Sendo preparada';
export const licenseAwaitingAccountText = 'Aguardando o número da sua conta';
export const licenseNoneText = 'Aguardando confirmação do pagamento';
export const licenseRevokedText = 'Revogada';

// pt-BR DD/MM, no year — spec.md's Implementation Decisions is literal:
// "ativa até DD/MM".
function formatDayMonth(iso: string): string {
	const date = new Date(iso);
	const day = String(date.getUTCDate()).padStart(2, '0');
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${day}/${month}`;
}

export function licenseActiveText(expiresAt: string): string {
	if (expiresAt === LIFETIME_EXPIRY) return licenseLifetimeText;
	return `Ativa até ${formatDayMonth(expiresAt)}`;
}

export function licenseExpiredText(expiresAt: string): string {
	return `Expirada em ${formatDayMonth(expiresAt)}`;
}

/** One line per Licença state, so the page never branches on status itself. */
export function licenseStatusText(license: LicenseStatus): string {
	switch (license.status) {
		case 'none':
			return licenseNoneText;
		case 'awaiting_account':
			return licenseAwaitingAccountText;
		case 'preparing':
			return licensePreparingText;
		case 'active':
			return licenseActiveText(license.expiresAt);
		case 'expired':
			return licenseExpiredText(license.expiresAt);
		case 'revoked':
			return licenseRevokedText;
	}
}

// Corretora account entry (catalog-pivot 07, ADR-0006). No Figma frame exists; reuses the
// /login form styles. Shown only while the Licença is `awaiting_account`; the download stays
// unavailable until the account is bound and the binary compiled for it.
export const corretoraBannerHeading = 'Informe sua conta na Corretora';
export const corretoraBannerBody =
	'Para preparar seu Robô, precisamos do número da conta na Corretora onde ele vai operar. ' +
	'A Licença fica vinculada a essa conta e o download só é liberado depois que o Robô for preparado para ela.';
export const corretoraAccountLabel = 'Número da conta';
export const corretoraAccountHint =
	'Somente números. Depois de enviado, o número só pode ser alterado pelo nosso suporte.';
export const corretoraSubmitLabel = 'Enviar número da conta';
export const corretoraConfirmMessage =
	'Confirma o número da conta? Depois de enviado, ele só pode ser alterado pelo nosso suporte.';

export type CorretoraNotice = 'saved' | 'invalid' | 'exists' | 'unavailable';
export const corretoraNoticeTexts: Record<CorretoraNotice, string> = {
	saved: 'Recebemos o número da conta. Estamos preparando seu Robô e avisaremos quando o download estiver liberado.',
	invalid: 'Número de conta inválido. Digite apenas números, sem espaços ou zeros à esquerda.',
	exists: 'O número da conta já foi informado e não pode ser alterado aqui. Fale com o nosso suporte.',
	unavailable: 'Não foi possível registrar o número da conta para esta compra. Fale com o nosso suporte.',
};

// Notice banner tone: a saved account number is good news, the rest are errors.
export type NoticeTone = 'success' | 'danger';
export const corretoraNoticeTones: Record<CorretoraNotice, NoticeTone> = {
	saved: 'success',
	invalid: 'danger',
	exists: 'danger',
	unavailable: 'danger',
};

// Figma restyle ticket 04 (.scratch/figma-restyle/issues/04-conta-restyle.md): one status badge
// per Licença state. `icon` is a key into the Lucide map in `src/components/license-card.astro`
// so this file stays free of component imports. Derived states (everything but the wireframe's
// "Expirada" / "Pagamento pendente") reuse the same badge pattern; owner reviews them in browser.
export type BadgeTone = 'success' | 'danger' | 'neutral';
export type LicenseBadgeIcon = 'hourglass' | 'key-round' | 'cog' | 'shield-check' | 'circle-x' | 'shield-alert';
export type LicenseBadge = { label: string; icon: LicenseBadgeIcon; tone: BadgeTone };

export const licenseBadges: Record<LicenseStatus['status'], LicenseBadge> = {
	none: { label: 'Pagamento pendente', icon: 'hourglass', tone: 'neutral' },
	awaiting_account: { label: 'Conta pendente', icon: 'key-round', tone: 'neutral' },
	preparing: { label: 'Em preparo', icon: 'cog', tone: 'neutral' },
	active: { label: 'Licença ativa', icon: 'shield-check', tone: 'success' },
	expired: { label: 'Licença expirada', icon: 'circle-x', tone: 'neutral' },
	revoked: { label: 'Licença revogada', icon: 'shield-alert', tone: 'danger' },
};

// Static panel from the `estados-licenca` wireframe. Adapted copy (the frame mentions Pix/boleto
// and suspension), so it waits for the owner's launch pass.
export const backendNoteHeading = launchBlocking(
	'Liberação somente após confirmação do backend',
	'Adapted from the Figma estados-licenca frame (86:1602); wording not yet approved by the owner.'
);
export const backendNoteBody = launchBlocking(
	'O backend valida o pagamento e a Licença antes de liberar o acesso ao Robô. Concluir o checkout não libera o acesso por si só. Na expiração ou revogação, o acesso permanece bloqueado.',
	'Adapted from the Figma estados-licenca frame (86:1602); wording not yet approved by the owner.'
);

export const customerAreaLabel = 'Área do cliente';

export const logoutLabel = 'Sair';

export const cancelLabel = 'Cancelar assinatura';

// One click plus one confirmation (User Story 10) — a native `confirm()`
// dialog is the friction step, no custom modal built for this (spec.md's
// stance against speculative generality).
export const cancelConfirmMessage =
	'Tem certeza que deseja cancelar sua Assinatura? Sua Licença continua ativa até a data ' +
	'de expiração já definida, mas a cobrança recorrente para automaticamente.';
