/**
 * Where the Robô gallery lives in URL space (.scratch/robot-gallery/spec.md, ADR-0009): the
 * status-gated media route, the gallery section of a Robô's edit page, the admin gallery actions
 * under it, and the 303 every action answers with. The one place these paths are built.
 */

import type { GalleryErrorCode } from './gallery';

/** The public URL of an image item (the status-gated media route). */
export const mediaPath = (id: string): string => `/media/${encodeURIComponent(id)}`;

/** The gallery section of a Robô's edit page, where every gallery action returns. */
export const galleryAnchor = 'galeria';

const robotEditPath = (slug: string): string => `/admin/robos/${encodeURIComponent(slug)}`;

export const galleryPagePath = (slug: string): string => `${robotEditPath(slug)}#${galleryAnchor}`;

/** The admin gallery POST routes: one per Robô, and one per item. */
type GalleryAction = 'imagens' | 'video';
type GalleryItemAction = 'legenda' | 'mover' | 'remover';

/** The URL an admin gallery form posts to (`/admin/robos/<slug>/galeria/...`). */
export function galleryActionPath(slug: string, action: GalleryAction): string;
export function galleryActionPath(slug: string, action: GalleryItemAction, itemId: string): string;
export function galleryActionPath(slug: string, action: GalleryAction | GalleryItemAction, itemId?: string): string {
	const base = `${robotEditPath(slug)}/galeria`;
	return itemId === undefined ? `${base}/${action}` : `${base}/${encodeURIComponent(itemId)}/${action}`;
}

/** Flash keys a successful gallery action redirects with (`?ok=`); worded in `src/content/admin.ts`. */
export type GalleryFlashKey = 'gallery-added' | 'gallery-removed' | 'gallery-video-added' | 'gallery-caption-saved' | 'gallery-moved';

/** How a gallery action went: a flash key, an error code, or nothing to say. */
export type GalleryOutcome = { ok: GalleryFlashKey } | { error: GalleryErrorCode } | null;

/**
 * The 303 after a gallery POST: back to the edit page's gallery section with a flash key or an
 * error code, never free text (the page looks both up in its content file).
 */
export function galleryRedirect(origin: string, slug: string, outcome: GalleryOutcome): Response {
	const target = new URL(robotEditPath(slug), origin);
	if (outcome !== null && 'ok' in outcome) target.searchParams.set('ok', outcome.ok);
	else if (outcome !== null) target.searchParams.set('error', outcome.error);
	target.hash = galleryAnchor;
	return new Response(null, { status: 303, headers: { Location: target.toString() } });
}
