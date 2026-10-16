import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { openMedia } from '../../modules/catalog/gallery';
import { requireAdmin } from '../../modules/identity/admin';

export const prerender = false;

// Robô gallery images, by item id (ADR-0009, .scratch/robot-gallery/spec.md). Served only while
// the Robô is published; a draft or archived Robô's only to an admin (the catalog preview and the
// edit page's thumbnails), never cached. Anything else, an unknown id or a missing object, is a
// plain 404 that tells a prober nothing. The admin check runs only for an unpublished Robô, so a
// public image costs one D1 read and one R2 read.
export const GET: APIRoute = async ({ request, params }) => {
	const result = await openMedia(env, params.id ?? '', async () => (await requireAdmin(request, env)).ok);
	if (!result.ok) return new Response(null, { status: 404 });

	return new Response(result.body, {
		headers: {
			'Content-Type': result.contentType,
			'Content-Length': String(result.size),
			'X-Content-Type-Options': 'nosniff',
			// An id never maps to other bytes, so a published image can be cached for good.
			'Cache-Control': result.cache === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
		},
	});
};
