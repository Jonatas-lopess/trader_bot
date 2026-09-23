import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requestMagicLink } from '../../modules/identity/magic-link';

export const prerender = false;

// Always redirects to the same place regardless of internal outcome
// (match, no-match, or throttled) — User Story 3.
export const POST: APIRoute = async ({ request, url }) => {
	const formData = await request.formData();
	const email = formData.get('email');

	if (typeof email === 'string' && email !== '') {
		await requestMagicLink(env, {
			email,
			ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
			origin: url.origin,
		});
	}

	return Response.redirect(new URL('/login?sent=1', url.origin), 303);
};
