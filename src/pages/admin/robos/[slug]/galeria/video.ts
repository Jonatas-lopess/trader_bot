import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { addVideo, galleryRedirect } from '../../../../../modules/catalog/gallery';
import { gateAdmin } from '../../../../../modules/identity/admin';

export const prerender = false;

// Add a YouTube video to a Robô's gallery (.scratch/robot-gallery/issues/02-youtube-video-items.md).
// Not an admin is an empty 404, a foreign Origin is 403. A small urlencoded form, so no size
// ceiling beyond the platform's. Only the parsed id is stored, and a refused link answers with
// its error code, never the link itself.
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;
	const slug = params.slug ?? '';

	let link = '';
	try {
		const value = (await request.formData()).get('url');
		if (typeof value === 'string') link = value;
	} catch {
		// unreadable body: treated as an empty link
	}

	const result = await addVideo(env, slug, link);
	if (!result.ok && result.error === 'not-found') return new Response(null, { status: 404 });
	return galleryRedirect(url.origin, slug, result.ok ? { ok: 'gallery-video-added' } : { error: result.error });
};
