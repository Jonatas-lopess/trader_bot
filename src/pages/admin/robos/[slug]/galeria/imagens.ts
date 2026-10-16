import { env } from 'cloudflare:workers';
import { galleryErrorText, gallery as galleryCopy } from '../../../../../content/admin';
import { addImages, MAX_UPLOAD_REQUEST_BYTES } from '../../../../../modules/catalog/gallery';
import { galleryPagePath } from '../../../../../modules/catalog/gallery-paths';
import { galleryAction, outcomeOf, readForm } from './_action';

export const prerender = false;

const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * The readable answer to an oversize upload. A plain form post (no JavaScript) lands here, so it
 * is a small page with the limit and a way back, not a bare status code.
 */
function tooLargePage(slug: string): Response {
	const back = escapeHtml(galleryPagePath(slug));
	const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(galleryCopy.tooLargePage.title)}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5">
<h1>${escapeHtml(galleryCopy.tooLargePage.title)}</h1>
<p>${escapeHtml(galleryErrorText('request-too-large') ?? '')}</p>
<p><a href="${back}">${escapeHtml(galleryCopy.tooLargePage.backLabel)}</a></p>
</body>
</html>`;
	return new Response(html, {
		status: 413,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', Connection: 'close' },
	});
}

/**
 * Reads and throws away an oversize upload's bytes, up to `MAX_DISCARD_BYTES`, without parsing or
 * keeping them. A browser that is still sending when the answer arrives drops that answer (a
 * blank page in Chromium, checked in robot-gallery 05), so the refusal is decided first and the
 * rest of the upload is drained before answering, the way a web server's lingering close does.
 * Past the bound the stream is cancelled; the edge caps request bodies anyway.
 */
const MAX_DISCARD_BYTES = 2 * MAX_UPLOAD_REQUEST_BYTES;
async function discardBody(request: Request): Promise<void> {
	if (request.body === null) return;
	const reader = request.body.getReader();
	let seen = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			seen += value.byteLength;
			if (seen > MAX_DISCARD_BYTES) {
				await reader.cancel();
				return;
			}
		}
	} catch {
		// a client that hung up: nothing left to answer
	}
}

// Upload images to a Robô's gallery (.scratch/robot-gallery/issues/01-image-gallery-admin.md).
// Order of checks: the `galleryAction` gate (not an admin is an empty 404, a foreign Origin is
// 403), then the declared Content-Length is held against a hard ceiling before the body is parsed
// (a missing length is refused too: browsers always send one for a form post). An oversize body
// is never parsed or stored, only drained (bounded) so the browser shows the 413 page. Otherwise
// the multipart body is parsed; the gallery module judges every file by its bytes.
export const POST = galleryAction(async ({ request, slug }) => {
	const declared = request.headers.get('Content-Length');
	if (declared === null || !/^\d+$/.test(declared)) return new Response(null, { status: 411 });
	if (Number(declared) > MAX_UPLOAD_REQUEST_BYTES) {
		await discardBody(request);
		return tooLargePage(slug);
	}

	const form = await readForm(request);
	if (form === null) return { error: 'no-files' };
	// An untouched file input still posts one empty, nameless part.
	const files = form.getAll('images').filter((value): value is File => typeof value !== 'string' && value.size > 0);

	const result = await addImages(env, slug, files);
	if (!result.ok && result.error === 'not-found') return new Response(null, { status: 404 });
	return outcomeOf(result, 'gallery-added');
});
