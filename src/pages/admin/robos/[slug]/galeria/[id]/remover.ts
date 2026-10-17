import { env } from 'cloudflare:workers';
import { removeItem } from '../../../../../../modules/catalog/gallery';
import { galleryAction, outcomeOf } from '../_action';

export const prerender = false;

// Remove one gallery item and, for an image, its stored file
// (.scratch/robot-gallery/issues/01-image-gallery-admin.md). POST only, gated by
// `galleryAction`. The page asks for confirmation first (confirm-dialog.astro).
export const POST = galleryAction(async ({ slug, itemId }) => outcomeOf(await removeItem(env, slug, itemId), 'gallery-removed'));
