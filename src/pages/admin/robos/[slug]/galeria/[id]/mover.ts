import { env } from 'cloudflare:workers';
import { moveItem } from '../../../../../../modules/catalog/gallery';
import { galleryAction, outcomeOf, readForm, textField } from '../_action';

export const prerender = false;

// Move one gallery item a place up or down (.scratch/robot-gallery/issues/03-captions-reorder-rename.md).
// Plain POST forms, so reordering works without JavaScript; gated by `galleryAction`. A
// direction other than up or down (or an unreadable body) changes nothing and returns quietly.
export const POST = galleryAction(async ({ request, slug, itemId }) => {
	const direction = textField(await readForm(request), 'direction');
	if (direction !== 'up' && direction !== 'down') return null;

	return outcomeOf(await moveItem(env, slug, itemId, direction), 'gallery-moved');
});
