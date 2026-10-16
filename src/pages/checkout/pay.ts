import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { pay } from '../../modules/billing/pay';

export const prerender = false;

/** The body is a few short fields and a card token; anything larger is not ours. */
const MAX_BODY_BYTES = 8 * 1024;

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// POST /checkout/pay: the own checkout form's submit (modules/billing/pay.ts, ADR-0007).
// Never logs the request body: it holds buyer data and the card token.
export const POST: APIRoute = async ({ request }) => {
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ ok: false, code: 'invalid_request' }, 413);

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ ok: false, code: 'invalid_request' }, 400);
	}

	const result = await pay(env, { body, ip: request.headers.get('CF-Connecting-IP') });
	if (result.ok) return json(result, 200);
	const { status, ...rest } = result;
	return json(rest, status);
};
