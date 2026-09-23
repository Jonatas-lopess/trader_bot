/**
 * Copy for `/login` — .scratch/customer-area/issues/02-magic-link-login.md,
 * PLANNING.md §7 (magic link, no passwords). Typed content file per
 * docs/agents/content-files.md; consumed by `src/pages/login.astro`.
 */

export const pageTitle = 'Entrar';
export const pageDescription = 'Acesse sua área do cliente com um link enviado por e-mail.';

export const heading = 'Entrar na área do cliente';
export const subheading = 'Digite seu e-mail e enviaremos um link de acesso. Sem senha.';

export const emailLabel = 'E-mail';
export const submitLabel = 'Enviar link de acesso';

// User Story 3: identical regardless of whether the email matches a
// customers row — this text must never imply a match/no-match outcome.
export const sentMessage =
	'Se esse e-mail existir em nossa base, você receberá um link de acesso em instantes.';

export const errorMessage =
	'Esse link não é mais válido. Ele pode ter expirado ou já ter sido usado — solicite um novo abaixo.';
