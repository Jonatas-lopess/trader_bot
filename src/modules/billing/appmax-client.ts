/**
 * The one outbound-fetch seam to Appmax's API — spec.md's Testing Decisions
 * ("Only fetch calls to Appmax's API are mocked") mocks exactly this
 * module's boundary, nothing inside `modules/billing` that calls it.
 *
 * UNVERIFIED CONTRACT. spec.md's Further Notes flag the exact Appmax
 * hosted-checkout request/response contract as "not fully pinned down in
 * this spec — confirm against Appmax's sandbox during implementation". No
 * Appmax sandbox credentials were available while writing this file — the
 * base URLs, auth flow and request/response field names below are the
 * best-documented approximation from Appmax's public docs
 * (docs.appmax.com.br, help-center.appmax.com.br) and have NOT been
 * exercised against a live sandbox call. Recorded as unverified in
 * PLANNING.md §13, same status as this repo's other unconfirmed Appmax
 * facts. Whoever gets sandbox access next should verify this file's field
 * names against a real call before go-live; nothing downstream (the D1
 * writes, the webhook's re-fetch, idempotency) depends on these exact field
 * names being right, only on this module's exported function signatures
 * staying the same — that's the point of keeping this the one seam.
 *
 * Correlation design: rather than depend on an unconfirmed Appmax field to
 * find our own row from the post-payment redirect, we mint our own opaque
 * `reference` (modules/billing/checkout.ts) before calling Appmax and pass
 * it as both `external_id` (assuming Appmax echoes a merchant-supplied
 * reference back, per the `external_id`/`external_key` fields documented
 * elsewhere in Appmax's API) and embedded in `return_url`, which every
 * hosted-checkout provider supports configuring. The redirect therefore
 * always carries our reference regardless of whether `external_id` turns
 * out to be real.
 */

const APPMAX_AUTH_URL = 'https://auth.sandboxappmax.com.br/oauth2/token';
const APPMAX_API_BASE_URL = 'https://api.sandboxappmax.com.br';

type AppmaxCredentials = Pick<Cloudflare.Env, 'APPMAX_CLIENT_ID' | 'APPMAX_CLIENT_SECRET'>;

type CreateHostedCheckoutSessionParams = {
	reference: string;
	planId: string;
	amountCents: number;
	returnUrl: string;
};

export type CreateHostedCheckoutSessionResult =
	| { ok: true; checkoutUrl: string; appmaxOrderId: string | null }
	| { ok: false; reason: 'appmax_auth_failed' | 'appmax_unavailable' };

async function getAccessToken(env: AppmaxCredentials): Promise<string | null> {
	const response = await fetch(APPMAX_AUTH_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: env.APPMAX_CLIENT_ID,
			client_secret: env.APPMAX_CLIENT_SECRET,
		}),
	});
	if (!response.ok) return null;
	const body = await response.json<{ access_token: string }>();
	return body.access_token;
}

export async function createHostedCheckoutSession(
	env: AppmaxCredentials,
	params: CreateHostedCheckoutSessionParams
): Promise<CreateHostedCheckoutSessionResult> {
	const token = await getAccessToken(env);
	if (token === null) return { ok: false, reason: 'appmax_auth_failed' };

	const response = await fetch(`${APPMAX_API_BASE_URL}/payment-links`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			external_id: params.reference,
			amount: params.amountCents,
			return_url: params.returnUrl,
			metadata: { plan_id: params.planId },
		}),
	});
	if (!response.ok) return { ok: false, reason: 'appmax_unavailable' };

	const body = await response.json<{ data: { url: string; order_id?: string } }>();
	return { ok: true, checkoutUrl: body.data.url, appmaxOrderId: body.data.order_id ?? null };
}
