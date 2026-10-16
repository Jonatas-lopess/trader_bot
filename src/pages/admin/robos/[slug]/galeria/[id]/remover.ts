import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { galleryRedirect, removeItem } from '../../../../../../modules/catalog/gallery';
import { gateAdmin } from '../../../../../../modules/identity/admin';

export const prerender = false;

// Remove one gallery item and, for an image, its stored file
// (.scratch/robot-gallery/issues/01-image-gallery-admin.md). POST only; not an admin is an empty
// 404, a foreign Origin is 403. The page asks for confirmation first (confirm-dialog.astro).
export const POST: APIRoute = async ({ request, params, url }) => {
	const gate = await gateAdmin(request, env, { checkOrigin: true });
	if (!gate.ok) return gate.response;
	const slug = params.slug ?? '';

	const result = await removeItem(env, slug, params.id ?? '');
	return galleryRedirect(url.origin, slug, result.ok ? { ok: 'gallery-removed' } : { error: result.error });
};
