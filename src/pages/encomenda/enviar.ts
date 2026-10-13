import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submitEncomenda, type SubmitEncomendaResult } from '../../modules/orders/encomenda';
import { isJsonRequest, readEncomendaFields, resultLocation } from '../../modules/orders/encomenda-request';

export const prerender = false;

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** No-JS fallback: a plain form post ends on the server-rendered `/encomenda/resultado` page. */
const redirectTo = (errors: readonly string[]) =>
	new Response(null, { status: 303, headers: { Location: resultLocation(errors) } });

function respond(result: SubmitEncomendaResult): Response {
	if (result.ok) return json({ ok: true, whatsappHref: result.whatsappHref }, 200);
	if (result.reason === 'invalid') return json({ ok: false, reason: result.reason, fieldErrors: result.fieldErrors }, 422);
	return json({ ok: false, reason: result.reason }, result.reason === 'rate-limited' ? 429 : 500);
}

function respondWithRedirect(result: SubmitEncomendaResult): Response {
	if (result.ok) return redirectTo([]);
	if (result.reason === 'invalid') return redirectTo(Object.values(result.fieldErrors));
	return redirectTo([result.reason === 'rate-limited' ? 'rate-limited' : 'server']);
}

// POST /encomenda/enviar: the prerendered page at /encomenda posts here with `fetch` (a page and an
// endpoint cannot share one route in Astro) and gets JSON; a browser form post without JavaScript
// is redirected to the result page instead.
export const POST: APIRoute = async ({ request }) => {
	const wantsJson = isJsonRequest(request);

	const read = await readEncomendaFields(request);
	if (!read.ok) {
		if (!wantsJson) return redirectTo(['server']);
		return json({ ok: false, reason: read.reason }, read.reason === 'too-large' ? 413 : 400);
	}

	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	const result = await submitEncomenda(env, { fields: read.fields, ip });
	return wantsJson ? respond(result) : respondWithRedirect(result);
};
