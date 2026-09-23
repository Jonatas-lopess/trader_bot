import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireSession, revokeSession, SESSION_COOKIE_NAME } from '../modules/identity/session';

export const prerender = false;

// User Story 7: revokes the sessions row (not just the browser's own
// cookie), so a subsequent request replaying the old cookie is rejected
// even though the cookie's signature is still valid.
export const POST: APIRoute = async ({ request, url, cookies }) => {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (session.ok) {
		await revokeSession(env, session.sessionId);
	}
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });

	return Response.redirect(new URL('/login', url.origin), 303);
};
