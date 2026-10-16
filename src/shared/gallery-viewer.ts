/**
 * Browser-side behaviour of a Robô gallery in the "Saiba mais" modal (robot-gallery 04,
 * src/components/robot-gallery.astro). Called by robot-dialog.astro on the gallery it just cloned
 * into the dialog; the card's own copy (no-JS, inline) is never enhanced.
 *
 * Shows one item at a time, with the thumbnail strip (buttons, `aria-pressed`) to switch. A video
 * is a poster link until pressed; only then is the YouTube iframe created, from the embed URL the
 * server rendered (`data-embed-src`, rebuilt from the stored id). Switching away from a playing
 * video puts its poster back, which drops the iframe and stops the sound. DOM nodes only, no
 * `innerHTML`.
 */

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

/** Replaces a pressed poster with the player; returns a function that puts the poster back. */
function play(poster: HTMLAnchorElement): () => void {
	const embedSrc = poster.dataset.embedSrc;
	if (!embedSrc) return () => {};
	const frame = document.createElement('div');
	frame.className = 'relative aspect-video w-full overflow-hidden rounded-md bg-surface-sunken';
	const iframe = document.createElement('iframe');
	iframe.src = `${embedSrc}?autoplay=1&rel=0`;
	iframe.title = poster.dataset.title ?? '';
	iframe.allow = IFRAME_ALLOW;
	iframe.allowFullscreen = true;
	iframe.referrerPolicy = 'strict-origin-when-cross-origin';
	iframe.className = 'absolute inset-0 h-full w-full';
	frame.appendChild(iframe);
	poster.replaceWith(frame);
	iframe.focus();
	return () => frame.replaceWith(poster);
}

export function enhanceGallery(root: HTMLElement): void {
	const items = Array.from(root.querySelectorAll<HTMLElement>('[data-gallery-item]'));
	const strip = root.querySelector<HTMLElement>('[data-gallery-strip]');
	const thumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]'));
	const stopPlayers = new Set<() => void>();

	const stopAll = () => {
		for (const stop of stopPlayers) stop();
		stopPlayers.clear();
	};

	const show = (index: number) => {
		stopAll();
		items.forEach((item, i) => (item.hidden = i !== index));
		thumbs.forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === index)));
	};

	if (strip && items.length > 1) {
		strip.hidden = false;
		show(0);
		for (const thumb of thumbs) {
			thumb.addEventListener('click', () => show(Number(thumb.dataset.index ?? 0)));
		}
	}

	for (const poster of root.querySelectorAll<HTMLAnchorElement>('a[data-gallery-play]')) {
		poster.addEventListener('click', (event) => {
			event.preventDefault();
			stopAll();
			stopPlayers.add(play(poster));
		});
	}
}
