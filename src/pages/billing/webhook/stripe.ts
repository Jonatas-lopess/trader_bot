import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleStripeWebhook } from '../../../modules/billing/stripe-webhook';

export const prerender = false;

// Test-only stopgap route (docs/adr/0005-stripe-test-driver.md) — exists
// alongside /billing/webhook (Appmax, the committed production webhook),
// not in place of it. Signature verification is handleStripeWebhook's own
// job, same split as webhook-hardening.ts vs webhook.ts for Appmax.
export const POST: APIRoute = async ({ request }) => {
	const rawBody = await request.text();
	const signatureHeader = request.headers.get('Stripe-Signature');

	const result = await handleStripeWebhook(env, rawBody, signatureHeader);
	return new Response(null, { status: result.status });
};
