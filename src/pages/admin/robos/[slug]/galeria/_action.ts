// Shared shape of the admin gallery POST routes (.scratch/robot-gallery/spec.md). The leading
// underscore keeps this file out of Astro's routing.
//
// Every action is gated the same way: not an admin is an empty 404, a foreign Origin is 403.
// The handler then gets the Robô slug (and the item id, on the per-item routes) and answers with
// an outcome, which becomes the 303 back to the edit page's gallery section, or with a Response
// sent as is.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { GalleryErrorCode } from '../../../../../modules/catalog/gallery';
import { galleryRedirect, type GalleryFlashKey, type GalleryOutcome } from '../../../../../modules/catalog/gallery-paths';
import { gateAdmin } from '../../../../../modules/identity/admin';

export type GalleryActionInput = { request: Request; slug: string; itemId: string };

export function galleryAction(handle: (input: GalleryActionInput) => Promise<GalleryOutcome | Response>): APIRoute {
	return async ({ request, params, url }) => {
		const gate = await gateAdmin(request, env, { checkOrigin: true });
		if (!gate.ok) return gate.response;
		const slug = params.slug ?? '';
		const outcome = await handle({ request, slug, itemId: params.id ?? '' });
		return outcome instanceof Response ? outcome : galleryRedirect(url.origin, slug, outcome);
	};
}

/** The posted form, or `null` when the body cannot be read as one. */
export async function readForm(request: Request): Promise<FormData | null> {
	try {
		return await request.formData();
	} catch {
		return null;
	}
}

/** A text field of the posted form; missing, a file, or no readable form is `null`. */
export function textField(form: FormData | null, name: string): string | null {
	const value = form?.get(name);
	return typeof value === 'string' ? value : null;
}

/** A gallery module result as the redirect's outcome: the flash key on success, the error code otherwise. */
export const outcomeOf = (result: { ok: true } | { ok: false; error: GalleryErrorCode }, flash: GalleryFlashKey): GalleryOutcome =>
	result.ok ? { ok: flash } : { error: result.error };
