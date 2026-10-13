import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { gateAdmin } from '../../../modules/identity/admin';
import { resendDeadLetter } from '../../../modules/identity/send-with-dead-letter';

export const prerender = false;

// Resend one parked e-mail (storefront-v2 16). A non-admin gets the same empty 404 as the rest
// of /admin; an admin whose Origin does not match gets 403 (see `assertSameOrigin`). Redirects
// back to the list with the outcome, so a reload does not resend (POST, redirect, GET).
export const POST: APIRoute = async ({ request, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;

	const form = await request.formData();
	const id = form.get('id');
	const result = typeof id === 'string' && id !== '' ? await resendDeadLetter(env, id) : ({ ok: false, reason: 'not-found' } as const);

	const outcome = result.ok ? 'ok' : result.reason === 'send-failed' ? 'failed' : result.reason;
	return Response.redirect(new URL(`/admin/emails?resent=${outcome}`, url.origin), 303);
};
