/**
 * Reading `POST /encomenda/enviar`: a size cap enforced on the bytes actually received (not just
 * the `Content-Length` header, which a chunked or lying client controls), then JSON or form
 * parsing from those bytes. Pure over a `Request`, so it is unit-tested without the route.
 */

/** The form is a few short fields and one 2,000-character text; anything bigger is not a visitor. */
export const MAX_BODY_BYTES = 32 * 1024;

export type ReadFieldsResult =
	| { ok: true; fields: Record<string, unknown> }
	| { ok: false; reason: 'too-large' | 'bad-request' };

/** True for the page script's `fetch` (JSON body) or any client that asks for a JSON answer. */
export function isJsonRequest(request: Request): boolean {
	return (
		(request.headers.get('Content-Type') ?? '').includes('application/json') ||
		(request.headers.get('Accept') ?? '').includes('application/json')
	);
}

/** Where a no-JS submission ends: the result page, with the error codes (field codes or `rate-limited` / `server`) if any. */
export function resultLocation(errors: readonly string[]): string {
	return errors.length === 0 ? '/encomenda/resultado' : `/encomenda/resultado?erro=${errors.map(encodeURIComponent).join(',')}`;
}

/** The body as bytes, or null once more than `MAX_BODY_BYTES` have arrived (the stream is cancelled). */
async function readCapped(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
	const declared = Number(request.headers.get('Content-Length') ?? 0);
	if (declared > MAX_BODY_BYTES) return null;
	if (request.body === null) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BODY_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function readEncomendaFields(request: Request): Promise<ReadFieldsResult> {
	const bytes = await readCapped(request);
	if (bytes === null) return { ok: false, reason: 'too-large' };

	const contentType = request.headers.get('Content-Type') ?? '';
	try {
		if (contentType.includes('application/json')) {
			const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, reason: 'bad-request' };
			return { ok: true, fields: body as Record<string, unknown> };
		}
		// urlencoded or multipart: let the platform parse the already-capped bytes.
		const form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
		return { ok: true, fields: Object.fromEntries(form) };
	} catch {
		return { ok: false, reason: 'bad-request' };
	}
}
