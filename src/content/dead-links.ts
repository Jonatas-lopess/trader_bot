/**
 * Dead-link inventory.
 *
 * Labels with no destination in this scope (`.scratch/marketing-pages/spec.md`
 * → "Carried by the tickets, not resolved by them") live here and render as an inert element
 * (a `<span>`, never `<a href="#">`). The inventory is empty today; add an entry (and render it
 * inert) the next time a link ships before its destination does.
 *
 * Left this file, in order:
 * - `login`: `.scratch/customer-area/issues/02-magic-link-login.md` gave it a real destination
 *   (`/login`), see `src/content/header.ts`'s `loginLink`.
 * - Termos de uso and Política de privacidade:
 *   `.scratch/legal-pages/issues/01-termos-e-privacidade-pages.md` gave them routes, see
 *   `src/content/legal.ts`.
 * - Contato (footer) and "Falar com o suporte" (/conta):
 *   `.scratch/withdrawal-guarantee/issues/01-support-channel.md` made both a `mailto:` to the
 *   support address, see `src/content/support.ts`.
 *
 * This file is the one greppable place that lists the full dead set:
 *
 *   grep -rn "deadLinks\." src/
 */
export const deadLinks = {} as const;

export type DeadLinkKey = keyof typeof deadLinks;
