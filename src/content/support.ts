/**
 * Support channel — e-mail only in 0.1 (no chat, no ticket system).
 *
 * `.scratch/withdrawal-guarantee/issues/01-support-channel.md`. The footer's Contato link
 * (`src/content/footer.ts`) and the support card on /conta (`src/pages/conta.astro`) both open
 * a `mailto:` to this one address. Every Cliente-facing "fale com o suporte" sentence lands here.
 *
 * See `docs/agents/content-files.md` for the content-file and launch-blocking conventions.
 */

import { launchBlocking } from '../shared/launch-blocking';

export const supportEmail = launchBlocking(
	'suporte@robotrader.com.br',
	'Placeholder address: needs the production domain registered and a mailbox or Resend inbound behind it (PLANNING.md go-live prerequisites); the owner has not fixed the address or whether replies come from Resend or a plain mailbox.'
);

/** The `href` for any "fale com o suporte" link. */
export const supportMailto = (): string => `mailto:${supportEmail.value}`;
