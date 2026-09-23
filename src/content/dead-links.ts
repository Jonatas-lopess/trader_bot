/**
 * Dead-link inventory.
 *
 * These labels have no destination in this scope — legal pages are out of
 * scope for the marketing slice (PLANNING.md §1; `.scratch/marketing-pages/spec.md`
 * → "Carried by the tickets, not resolved by them"). Wherever one of these
 * appears in the header or footer it renders as an inert element (a
 * `<span>`, never `<a href="#">`) — see `src/components/site-header.astro`
 * and `src/components/site-footer.astro`.
 *
 * `login` used to live here too; it moved out once
 * `.scratch/customer-area/issues/02-magic-link-login.md` gave it a real
 * destination (`/login`) — see `src/content/header.ts`'s `loginLink`.
 *
 * This file is the one greppable place that lists the full dead set:
 *
 *   grep -rn "deadLinks\." src/
 */
export const deadLinks = {
	termosDeUso: 'Termos de uso',
	politicaDePrivacidade: 'Política de privacidade',
	contato: 'Contato',
} as const;

export type DeadLinkKey = keyof typeof deadLinks;
