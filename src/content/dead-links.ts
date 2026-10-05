/**
 * Dead-link inventory.
 *
 * These labels have no destination in this scope (`.scratch/marketing-pages/spec.md`
 * → "Carried by the tickets, not resolved by them"). Wherever one of these
 * appears in the header, footer or the /conta support card it renders as an inert element (a
 * `<span>`, never `<a href="#">`) — see `src/components/site-header.astro`
 * and `src/components/site-footer.astro`.
 *
 * `login` used to live here too; it moved out once
 * `.scratch/customer-area/issues/02-magic-link-login.md` gave it a real
 * destination (`/login`) — see `src/content/header.ts`'s `loginLink`.
 *
 * Termos de uso and Política de privacidade moved out once
 * `.scratch/legal-pages/issues/01-termos-e-privacidade-pages.md` gave them
 * routes — see `src/content/legal.ts`.
 *
 * This file is the one greppable place that lists the full dead set:
 *
 *   grep -rn "deadLinks\." src/
 */
export const deadLinks = {
	contato: 'Contato',
	// The support card on /conta (src/pages/conta.astro) — same missing support channel as Contato.
	suporte: 'Falar com o suporte',
} as const;

export type DeadLinkKey = keyof typeof deadLinks;
