import { describe, expect, it } from 'vitest';
import { isJsonRequest, MAX_BODY_BYTES, readEncomendaFields, resultLocation } from './encomenda-request';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
	new Request('https://example.com/encomenda/enviar', { method: 'POST', body, headers });

/** A body with no Content-Length (chunked), like a client that lies or omits it. */
function chunked(chunks: string[], headers: Record<string, string>): Request {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Request('https://example.com/encomenda/enviar', { method: 'POST', body: stream, headers, duplex: 'half' } as RequestInit);
}

describe('readEncomendaFields', () => {
	it('parses a JSON body', async () => {
		const request = post(JSON.stringify({ name: 'Ana', strategy: 'x' }), { 'Content-Type': 'application/json' });
		expect(await readEncomendaFields(request)).toEqual({ ok: true, fields: { name: 'Ana', strategy: 'x' } });
	});

	it('parses a urlencoded form body', async () => {
		const request = post(new URLSearchParams({ name: 'Ana', consent: 'on' }), {
			'Content-Type': 'application/x-www-form-urlencoded',
		});
		expect(await readEncomendaFields(request)).toEqual({ ok: true, fields: { name: 'Ana', consent: 'on' } });
	});

	it('parses a multipart form body', async () => {
		const form = new FormData();
		form.set('name', 'Ana');
		expect(await readEncomendaFields(post(form))).toEqual({ ok: true, fields: { name: 'Ana' } });
	});

	it('rejects malformed JSON and non-object JSON as bad-request', async () => {
		for (const body of ['{nope', '[1]', 'null', '"x"']) {
			const request = post(body, { 'Content-Type': 'application/json' });
			expect(await readEncomendaFields(request)).toEqual({ ok: false, reason: 'bad-request' });
		}
	});

	it('rejects a body over the cap by Content-Length', async () => {
		const request = post('x'.repeat(MAX_BODY_BYTES + 1), { 'Content-Type': 'application/json' });
		expect(await readEncomendaFields(request)).toEqual({ ok: false, reason: 'too-large' });
	});

	it('enforces the cap on the real body when Content-Length is absent or lies', async () => {
		const big = 'x'.repeat(MAX_BODY_BYTES);
		const noLength = chunked(['{"strategy":"', big, big, '"}'], { 'Content-Type': 'application/json' });
		expect(noLength.headers.get('Content-Length')).toBeNull();
		expect(await readEncomendaFields(noLength)).toEqual({ ok: false, reason: 'too-large' });

		const lying = chunked([big, 'y'], { 'Content-Type': 'application/json', 'Content-Length': '10' });
		expect(await readEncomendaFields(lying)).toEqual({ ok: false, reason: 'too-large' });
	});

	it('accepts a chunked body under the cap', async () => {
		const request = chunked(['{"name":', '"Ana"}'], { 'Content-Type': 'application/json' });
		expect(await readEncomendaFields(request)).toEqual({ ok: true, fields: { name: 'Ana' } });
	});
});

describe('resultLocation', () => {
	it('lists error codes in the query, none on success', () => {
		expect(resultLocation([])).toBe('/encomenda/resultado');
		expect(resultLocation(['name_invalid', 'consent_required'])).toBe('/encomenda/resultado?erro=name_invalid,consent_required');
	});
});

describe('isJsonRequest', () => {
	it('is true for a JSON content type or an Accept that asks for JSON', () => {
		expect(isJsonRequest(post('{}', { 'Content-Type': 'application/json' }))).toBe(true);
		expect(
			isJsonRequest(post('a=b', { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }))
		).toBe(true);
	});

	it('is false for a plain browser form post', () => {
		const accept = 'text/html,application/xhtml+xml,*/*;q=0.8';
		expect(isJsonRequest(post('a=b', { 'Content-Type': 'application/x-www-form-urlencoded', Accept: accept }))).toBe(false);
	});
});
