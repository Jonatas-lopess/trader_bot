import { env } from 'cloudflare:workers';
import { setCaption } from '../../../../../../modules/catalog/gallery';
import { galleryAction, outcomeOf, readForm, textField } from '../_action';

export const prerender = false;

// Save one gallery item's caption (.scratch/robot-gallery/issues/03-captions-reorder-rename.md).
// Gated by `galleryAction`. Blank clears the caption.
export const POST = galleryAction(async ({ request, slug, itemId }) => {
	const form = await readForm(request);
	// An unreadable body must not read as "clear the caption": change nothing.
	if (form === null) return null;

	return outcomeOf(await setCaption(env, slug, itemId, textField(form, 'caption') ?? ''), 'gallery-caption-saved');
});
