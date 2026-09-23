/**
 * Copy for `/conta`, the customer-area page —
 * .scratch/customer-area/issues/03-license-status-page.md, PLANNING.md §8.
 * Real product copy, ships as drawn (docs/agents/content-files.md).
 */

import type { SubscriptionState } from '../modules/identity/customers';

export const pageTitle = 'Sua conta';
export const pageDescription = 'Acompanhe o status da sua Licença e gerencie sua Assinatura.';

export const heading = 'Sua conta';
export const planLabel = 'Plano';
export const licenseLabel = 'Licença';
export const assinaturaLabel = 'Assinatura';

// Ticket 04 (.scratch/customer-area/issues/04-cancel-subscription.md): the
// page needs to reflect the Assinatura's own status too, not only the
// Licença's — most visibly after a successful cancel.
export const assinaturaStatusTexts: Record<SubscriptionState, string> = {
	pending: 'Pendente',
	active: 'Ativa',
	past_due: 'Pagamento atrasado',
	canceled: 'Cancelada',
};

export const licensePreparingText = 'Sendo preparada';

// pt-BR DD/MM, no year — spec.md's Implementation Decisions is literal:
// "ativa até DD/MM".
export function licenseActiveText(expiresAt: string): string {
	const date = new Date(expiresAt);
	const day = String(date.getUTCDate()).padStart(2, '0');
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `Ativa até ${day}/${month}`;
}

export const logoutLabel = 'Sair';

export const cancelLabel = 'Cancelar assinatura';

// One click plus one confirmation (User Story 10) — a native `confirm()`
// dialog is the friction step, no custom modal built for this (spec.md's
// stance against speculative generality).
export const cancelConfirmMessage =
	'Tem certeza que deseja cancelar sua Assinatura? Sua Licença continua ativa até a data ' +
	'de expiração já definida, mas a cobrança recorrente para automaticamente.';
