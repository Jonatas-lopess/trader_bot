import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { issueDevLoginUrl } from '../../modules/identity/magic-link';

export const prerender = false;

// Test-env login without the magic-link e-mail (Resend's shared sender only delivers to the
// account owner). 404s unless `DEV_LOGIN_KEY` is set and matches, so an env without the secret
// has no such route as far as a caller can tell. Redirects into the normal /login/verify, so
// the session is minted by the same path as a real magic link.
export const GET: APIRoute = async ({ url }) => {
	const verifyUrl = await issueDevLoginUrl(env, {
		email: url.searchParams.get('email') ?? '',
		key: url.searchParams.get('key') ?? '',
		origin: url.origin,
	});
	if (verifyUrl === null) return new Response(null, { status: 404 });
	return Response.redirect(verifyUrl, 303);
};
