import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSubscriptionStatus } from '../../modules/billing/status';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const result = await getSubscriptionStatus(env, url.searchParams.get('ref'));
	if (!result.ok) {
		return new Response(JSON.stringify({ error: 'not_found' }), {
			status: result.status,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	return new Response(JSON.stringify({ status: result.state }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
