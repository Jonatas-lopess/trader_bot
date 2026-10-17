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
 *
 * Every item sits in the same 16:9 viewport (images are letterboxed with `object-contain`). Pressing
 * an image opens it at full size in a second native <dialog> on top of the modal (Esc or a click
 * closes only that one); without JavaScript the link just opens the image in a new tab.
 */

// Trims the player's extras: related videos stay within the channel, no annotations, no YouTube logo
// on the control bar, inline on mobile. YouTube still draws its own title bar and "watch on" link.
const PLAYER_PARAMS = 'autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&cc_load_policy=0';
const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

/** Replaces a pressed poster with the player; returns a function that puts the poster back. */
function play(poster: HTMLAnchorElement): () => void {
	const embedSrc = poster.dataset.embedSrc;
	if (!embedSrc) return () => {};
	const frame = document.createElement('div');
	frame.className = 'relative aspect-video w-full overflow-hidden rounded-md bg-surface-sunken';
	const iframe = document.createElement('iframe');
	iframe.src = `${embedSrc}?${PLAYER_PARAMS}`;
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

let lightbox: { dialog: HTMLDialogElement; image: HTMLImageElement; close: HTMLButtonElement } | null = null;

/** The one full-size viewer, built on first use and kept on <body> (outside the robot dialog). */
function getLightbox() {
	if (lightbox) return lightbox;
	const dialog = document.createElement('dialog');
	dialog.className =
		'm-auto max-h-[95dvh] max-w-[95vw] overflow-visible border-0 bg-transparent p-0 backdrop:bg-surface-base/90';
	const image = document.createElement('img');
	image.className = 'block max-h-[90dvh] max-w-[95vw] cursor-zoom-out rounded-md object-contain';
	const close = document.createElement('button');
	close.type = 'button';
	close.textContent = '×';
	close.className =
		'absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-heading-3 leading-none text-text-primary shadow-card focus-visible:shadow-focus-ring focus-visible:outline-none';
	dialog.appendChild(image);
	dialog.appendChild(close);
	// A click anywhere (image, backdrop, button) dismisses; Escape is native.
	dialog.addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => image.removeAttribute('src'));
	document.body.appendChild(dialog);
	lightbox = { dialog, image, close };
	return lightbox;
}

function zoom(link: HTMLAnchorElement, closeLabel: string): void {
	const { dialog, image, close } = getLightbox();
	image.src = link.href;
	image.alt = link.querySelector('img')?.alt || link.getAttribute('aria-label') || '';
	close.setAttribute('aria-label', closeLabel);
	dialog.showModal();
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

	const closeLabel = root.dataset.zoomCloseLabel ?? '';
	for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-gallery-zoom]')) {
		link.addEventListener('click', (event) => {
			event.preventDefault();
			zoom(link, closeLabel);
		});
	}

	for (const poster of root.querySelectorAll<HTMLAnchorElement>('a[data-gallery-play]')) {
		poster.addEventListener('click', (event) => {
			event.preventDefault();
			stopAll();
			stopPlayers.add(play(poster));
		});
	}
}
