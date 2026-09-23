import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleWebhook } from '../../modules/billing/webhook';

export const prerender = false;

// Responds fast regardless of processing time (spec.md: Appmax's 5s
// timeout) — handleWebhook does the D1/Appmax work synchronously in the
// request but nothing here waits longer than that work itself requires.
export const POST: APIRoute = async ({ request }) => {
	const rawBody = await request.text();
	const result = await handleWebhook(env, rawBody);
	return new Response(null, { status: result.status });
};
