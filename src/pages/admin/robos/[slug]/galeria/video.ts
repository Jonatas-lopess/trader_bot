import { env } from 'cloudflare:workers';
import { addVideo } from '../../../../../modules/catalog/gallery';
import { galleryAction, outcomeOf, readForm, textField } from './_action';

export const prerender = false;

// Add a YouTube video to a Robô's gallery (.scratch/robot-gallery/issues/02-youtube-video-items.md).
// Gated by `galleryAction`. A small urlencoded form, so no size ceiling beyond the platform's.
// Only the parsed id is stored, and a refused link answers with its error code, never the link
// itself. An unreadable body is treated as an empty link.
export const POST = galleryAction(async ({ request, slug }) => {
	const link = textField(await readForm(request), 'url') ?? '';

	const result = await addVideo(env, slug, link);
	if (!result.ok && result.error === 'not-found') return new Response(null, { status: 404 });
	return outcomeOf(result, 'gallery-video-added');
});
