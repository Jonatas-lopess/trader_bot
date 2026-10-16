import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { galleryErrorText, gallery as galleryCopy } from '../../../../../content/admin';
import { addImages, galleryPagePath, galleryRedirect, MAX_UPLOAD_REQUEST_BYTES } from '../../../../../modules/catalog/gallery';
import { gateAdmin } from '../../../../../modules/identity/admin';

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

// Upload images to a Robô's gallery (.scratch/robot-gallery/issues/01-image-gallery-admin.md).
// Order of checks: not an admin is an empty 404, a foreign Origin is 403, then the declared
// Content-Length is held against a hard ceiling before a byte of the body is read (a missing
// length is refused too: browsers always send one for a form post). Only then is the multipart
// body parsed; the gallery module judges every file by its bytes.
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;
	const slug = params.slug ?? '';

	const declared = request.headers.get('Content-Length');
	if (declared === null || !/^\d+$/.test(declared)) return new Response(null, { status: 411 });
	if (Number(declared) > MAX_UPLOAD_REQUEST_BYTES) return tooLargePage(slug);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return galleryRedirect(url.origin, slug, { error: 'no-files' });
	}
	// An untouched file input still posts one empty, nameless part.
	const files = form.getAll('images').filter((value): value is File => typeof value !== 'string' && value.size > 0);

	const result = await addImages(env, slug, files);
	if (!result.ok && result.error === 'not-found') return new Response(null, { status: 404 });
	return galleryRedirect(url.origin, slug, result.ok ? { ok: 'gallery-added' } : { error: result.error });
};
