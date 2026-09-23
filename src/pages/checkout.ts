import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createCheckoutSession } from '../modules/billing/checkout';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const result = await createCheckoutSession(env, {
		planId: url.searchParams.get('plan'),
		origin: url.origin,
	});
	if (!result.ok) {
		return new Response(result.message, { status: result.status });
	}
	return Response.redirect(result.redirectUrl, 302);
};
