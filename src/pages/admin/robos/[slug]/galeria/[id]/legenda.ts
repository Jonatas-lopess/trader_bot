import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { galleryRedirect, setCaption } from '../../../../../../modules/catalog/gallery';
import { gateAdmin } from '../../../../../../modules/identity/admin';

export const prerender = false;

// Save one gallery item's caption (.scratch/robot-gallery/issues/03-captions-reorder-rename.md).
// Not an admin is an empty 404, a foreign Origin is 403. Blank clears the caption.
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;
	const slug = params.slug ?? '';

	let caption = '';
	try {
		const value = (await request.formData()).get('caption');
		if (typeof value === 'string') caption = value;
	} catch {
		// An unreadable body must not read as "clear the caption": change nothing.
		return galleryRedirect(url.origin, slug, null);
	}

	const result = await setCaption(env, slug, params.id ?? '', caption);
	return galleryRedirect(url.origin, slug, result.ok ? { ok: 'gallery-caption-saved' } : { error: result.error });
};
