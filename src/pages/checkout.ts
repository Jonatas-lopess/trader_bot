import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createCheckoutSession } from '../modules/billing/checkout';

export const prerender = false;

// Only `robot` + `offer` are read; any price-like param is ignored (ADR-0006).
export const GET: APIRoute = async ({ url }) => {
	const result = await createCheckoutSession(env, {
		robotId: url.searchParams.get('robot'),
		offer: url.searchParams.get('offer'),
		origin: url.origin,
	});
	if (!result.ok) {
		return new Response(result.message, { status: result.status });
	}
	return Response.redirect(result.redirectUrl, 302);
};
