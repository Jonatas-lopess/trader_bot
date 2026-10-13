import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submitEncomenda, type SubmitEncomendaResult } from '../../modules/orders/encomenda';

export const prerender = false;

// The form is a few short fields and one 2,000-character text; anything bigger is not a visitor.
const MAX_BODY_BYTES = 32 * 1024;

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function readFields(request: Request): Promise<Record<string, unknown> | null> {
	try {
		if ((request.headers.get('Content-Type') ?? '').includes('application/json')) {
			const body: unknown = await request.json();
			return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
		}
		return Object.fromEntries(await request.formData());
	} catch {
		return null;
	}
}

function respond(result: SubmitEncomendaResult): Response {
	if (result.ok) return json({ ok: true, whatsappHref: result.whatsappHref }, 200);
	if (result.reason === 'invalid') return json({ ok: false, reason: result.reason, fieldErrors: result.fieldErrors }, 422);
	return json({ ok: false, reason: result.reason }, result.reason === 'rate-limited' ? 429 : 500);
}

// POST /encomenda/enviar: the prerendered page at /encomenda posts here with `fetch` (a page and an
// endpoint cannot share one route in Astro); the answer is always JSON.
export const POST: APIRoute = async ({ request }) => {
	const length = Number(request.headers.get('Content-Length') ?? 0);
	if (length > MAX_BODY_BYTES) return json({ ok: false, reason: 'too-large' }, 413);

	const fields = await readFields(request);
	if (fields === null) return json({ ok: false, reason: 'bad-request' }, 400);

	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	return respond(await submitEncomenda(env, { fields, ip }));
};
