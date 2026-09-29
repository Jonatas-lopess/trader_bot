import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createCheckoutSession } from '../modules/billing/checkout';
import { requireSession } from '../modules/identity/session';

export const prerender = false;

// Only `robot` + `offer` are read; any price-like param is ignored (ADR-0006).
export const GET: APIRoute = async ({ url, request }) => {
	const session = await requireSession(request, env.SESSION_SECRET);
	const result = await createCheckoutSession(env, {
		robotId: url.searchParams.get('robot'),
		offer: url.searchParams.get('offer'),
		origin: url.origin,
		customerId: session.ok ? session.customerId : null,
	});
	if (!result.ok) {
		return new Response(result.message, { status: result.status });
	}
	return Response.redirect(result.redirectUrl, 302);
};
