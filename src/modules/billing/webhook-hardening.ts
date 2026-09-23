/**
 * Defense-in-depth in front of the webhook core (webhook.ts) —
 * .scratch/checkout-webhooks/issues/06-webhook-hardening.md, spec.md's
 * Webhook trust model: source-IP filtering and payload-shape validation
 * "sit in front of the handler as defense-in-depth — neither substitutes
 * for the API re-fetch" that webhook.ts itself does. Both layers here
 * reject early; they don't grant trust to anything that passes.
 */

import { parseWebhookPayload } from './appmax-client';

type HardeningEnv = Pick<Cloudflare.Env, 'APPMAX_WEBHOOK_IPS' | 'WEBHOOK_RATE_LIMITER'>;

export type HardeningResult = { ok: true } | { ok: false; status: 403 | 429 | 400 };

/**
 * UNVERIFIED: Appmax has not published a fixed webhook source-IP list
 * anywhere findable (this file's wrangler.jsonc comment has the detail).
 * `APPMAX_WEBHOOK_IPS` is an env var, empty by default — an empty list
 * rejects every IP (fail closed), not fail open, so this stays a go-live
 * gate (PLANNING.md §12) rather than something that silently does nothing
 * until configured.
 */
function isAllowedSourceIp(env: HardeningEnv, sourceIp: string | null): boolean {
	if (sourceIp === null) return false;
	const allowed = (env.APPMAX_WEBHOOK_IPS ?? '')
		.split(',')
		.map((ip) => ip.trim())
		.filter((ip) => ip !== '');
	return allowed.includes(sourceIp);
}

/** Cloudflare's Rate Limiting binding (ADR-0002) — no hand-rolled D1/KV counter. */
async function isWithinRateLimit(env: HardeningEnv, key: string): Promise<boolean> {
	const outcome = await env.WEBHOOK_RATE_LIMITER.limit({ key });
	return outcome.success;
}

/** Reuses webhook.ts's own parser — same "recognisable Appmax shape" bar, checked earlier. */
function hasValidPayloadShape(rawBody: string): boolean {
	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		return false;
	}
	return parseWebhookPayload(json) !== null;
}

export async function checkWebhookRequest(
	env: HardeningEnv,
	params: { sourceIp: string | null; rawBody: string }
): Promise<HardeningResult> {
	if (!isAllowedSourceIp(env, params.sourceIp)) return { ok: false, status: 403 };

	// Rate-limited by source, regardless of payload validity — a flood of
	// malformed posts must not even reach the shape check or D1, let alone
	// webhook.ts's own D1 writes and Appmax re-fetch (user story 12).
	if (!(await isWithinRateLimit(env, params.sourceIp ?? 'unknown'))) {
		return { ok: false, status: 429 };
	}

	if (!hasValidPayloadShape(params.rawBody)) return { ok: false, status: 400 };

	return { ok: true };
}
