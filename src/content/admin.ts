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
	{ label: 'Catálogo público', href: '/catalog', description: 'Como os Robôs aparecem para os visitantes.' },
	{ label: 'Área do cliente', href: '/conta', description: 'A visão de um Cliente com Licenças.' },
];
