import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleStripeWebhook } from '../../../modules/billing/stripe-webhook';

export const prerender = false;

// Test-only stopgap route (docs/adr/0005-stripe-test-driver.md) — exists
// alongside /billing/webhook (Appmax, the committed production webhook),
// not in place of it. Signature verification is handleStripeWebhook's own
// job, same split as webhook-hardening.ts vs webhook.ts for Appmax.
export const POST: APIRoute = async ({ request }) => {
	// Rate-limited by source IP, same pattern webhook-hardening.ts applies to
	// the Appmax route (code review finding: this route previously had no
	// throttling). No fixed Stripe source-IP list to allowlist against
	// (unlike Appmax's APPMAX_WEBHOOK_IPS) — Stripe's ranges are broad and
	// rotate — so this is throttling only, checked before the request body
	// is even read.
	const sourceIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	const rateLimit = await env.STRIPE_WEBHOOK_RATE_LIMITER.limit({ key: sourceIp });
	if (!rateLimit.success) return new Response(null, { status: 429 });

	const rawBody = await request.text();
	const signatureHeader = request.headers.get('Stripe-Signature');

	const result = await handleStripeWebhook(env, rawBody, signatureHeader);
	return new Response(null, { status: result.status });
};
