/**
 * Dead-link inventory.
 *
 * These labels have no destination in this scope — auth, the customer
 * area and legal pages are out of scope for the marketing slice
 * (PLANNING.md §1; `.scratch/marketing-pages/spec.md` → "Carried by the
 * tickets, not resolved by them"). Wherever one of these appears in the
 * header or footer it renders as an inert element (a `<span>`, never
 * `<a href="#">`) — see `src/components/site-header.astro` and
 * `src/components/site-footer.astro`.
 *
 * This file is the one greppable place that lists the full dead set:
 *
 *   grep -rn "deadLinks\." src/
 */
export const deadLinks = {
	login: 'Login',
	termosDeUso: 'Termos de uso',
	politicaDePrivacidade: 'Política de privacidade',
	contato: 'Contato',
} as const;

export type DeadLinkKey = keyof typeof deadLinks;
