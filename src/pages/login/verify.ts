import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { redeemMagicLink } from '../../modules/identity/magic-link';
import { SESSION_COOKIE_NAME } from '../../modules/identity/session';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');
	const result = token !== null ? await redeemMagicLink(env, token) : { ok: false as const };

	if (!result.ok) {
		return Response.redirect(new URL('/login?error=1', url.origin), 303);
	}

	cookies.set(SESSION_COOKIE_NAME, result.cookieValue, {
		httpOnly: true,
		// `wrangler dev`/local testing serves plain HTTP; a Secure cookie is
		// silently dropped there, breaking login end to end for anyone testing
		// locally (code review finding). Only require it once the request
		// actually arrived over HTTPS.
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		path: '/',
		expires: new Date(result.expiresAt),
	});

	// /conta is ticket 03's protected customer-area route.
	return Response.redirect(new URL('/conta', url.origin), 303);
};
