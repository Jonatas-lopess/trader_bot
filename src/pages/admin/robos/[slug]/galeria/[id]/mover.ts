import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { galleryRedirect, moveItem } from '../../../../../../modules/catalog/gallery';
import { gateAdmin } from '../../../../../../modules/identity/admin';

export const prerender = false;

// Move one gallery item a place up or down (.scratch/robot-gallery/issues/03-captions-reorder-rename.md).
// Plain POST forms, so reordering works without JavaScript. Not an admin is an empty 404, a
// foreign Origin is 403. A direction other than up or down changes nothing and returns quietly.
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;
	const slug = params.slug ?? '';

	let direction: string | null = null;
	try {
		const value = (await request.formData()).get('direction');
		if (typeof value === 'string') direction = value;
	} catch {
		// unreadable body: no direction
	}
	if (direction !== 'up' && direction !== 'down') return galleryRedirect(url.origin, slug, null);

	const result = await moveItem(env, slug, params.id ?? '', direction);
	return galleryRedirect(url.origin, slug, result.ok ? { ok: 'gallery-moved' } : { error: result.error });
};
