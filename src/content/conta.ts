/**
 * Copy for `/conta`, the customer-area page —
 * .scratch/customer-area/issues/03-license-status-page.md, PLANNING.md §8.
 * Real product copy, ships as drawn (docs/agents/content-files.md).
 */

export const pageTitle = 'Sua conta';
export const pageDescription = 'Acompanhe o status da sua Licença e gerencie sua Assinatura.';

export const heading = 'Sua conta';
export const planLabel = 'Plano';
export const licenseLabel = 'Licença';

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

// Wired up by ticket 04 (.scratch/customer-area/issues/04-cancel-subscription.md)
// — the form shell ships now since it costs nothing, but the confirm step
// and the cancel action itself are that ticket's scope, not this one's.
export const cancelLabel = 'Cancelar assinatura';
