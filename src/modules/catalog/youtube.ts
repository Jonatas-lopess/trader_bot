/**
 * YouTube links for Robô gallery videos (.scratch/robot-gallery/issues/02-youtube-video-items.md).
 * Only the 11-character video id is ever stored (`./gallery.ts`); embed, watch and thumbnail URLs
 * are rebuilt from it, so a pasted URL is never reflected.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/**
 * The 11-character video id from a pasted YouTube link: `youtube.com/watch?v=`, `youtu.be/`,
 * `/shorts/`, `/embed/` and `m.youtube.com`, with or without a scheme, tracking parameters or
 * extra path parts after the id.
 * Hosts match exactly (no lookalikes); anything else, or an id that is not 11 of
 * `[A-Za-z0-9_-]`, is `null`.
 */
export function parseYoutubeUrl(input: string): string | null {
	const text = input.trim();
	if (text === '') return null;
	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (url.port !== '' || url.username !== '' || url.password !== '') return null;

	const host = url.hostname.toLowerCase();
	const parts = url.pathname.split('/').filter((part) => part !== '');
	let id: string | null = null;
	// Path parts after the id (and every query parameter but `v`) are dropped.
	if (host === 'youtu.be') {
		id = parts[0] ?? null;
	} else if (YOUTUBE_HOSTS.has(host)) {
		if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v');
		else if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) id = parts[1];
	}
	return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

/** The privacy-enhanced embed, rebuilt from the stored id (never from what the admin pasted). */
export const youtubeEmbedUrl = (id: string): string => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;

/** The video's own YouTube page: where the poster links when there is no JavaScript to embed it. */
export const youtubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

/** YouTube's static thumbnail for a video, shown before play. */
export const youtubeThumbnailUrl = (id: string): string => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

/** Pixel size of `hqdefault.jpg`, so the thumbnail's box is reserved before it loads. */
export const YOUTUBE_THUMBNAIL_SIZE = { width: 480, height: 360 } as const;
