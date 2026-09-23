import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { checkWebhookRequest } from '../../modules/billing/webhook-hardening';
import { handleWebhook } from '../../modules/billing/webhook';

export const prerender = false;

// Responds fast regardless of processing time (spec.md: Appmax's 5s
// timeout) — neither the hardening layer nor handleWebhook wait longer
// than the work itself requires.
export const POST: APIRoute = async ({ request }) => {
	const rawBody = await request.text();
	const sourceIp = request.headers.get('CF-Connecting-IP');

	const hardening = await checkWebhookRequest(env, { sourceIp, rawBody });
	if (!hardening.ok) return new Response(null, { status: hardening.status });

	const result = await handleWebhook(env, rawBody);
	return new Response(null, { status: result.status });
};
