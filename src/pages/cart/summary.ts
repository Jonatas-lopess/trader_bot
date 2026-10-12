import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { summarizeCart } from '../../modules/catalog/price-cart';

export const prerender = false;

// Prices the browser cart's lines from D1 for display (storefront-v2 09). Public: no session, the
// cart holds no secret. All logic, including the rate limit by source IP, is `summarizeCart`.
export const POST: APIRoute = async ({ request }) => {
	const result = await summarizeCart(env, {
		sourceIp: request.headers.get('CF-Connecting-IP'),
		rawBody: await request.text(),
	});
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
};
