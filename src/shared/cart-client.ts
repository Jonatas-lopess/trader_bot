/**
 * Browser wiring of the cart (storefront-v2 08): the header count and every
 * "Adicionar ao carrinho" button. Started once from `src/components/site-header.astro`, so it runs
 * on every site page and nowhere on the server.
 *
 * One delegated click listener serves the buttons on the cards and the ones cloned into the
 * "Saiba mais" modal, which do not exist at page load. A button names its line with
 * `data-add-to-cart data-robot data-offer`; there is never a price in the markup or the store.
 */

import { addedAnnouncement, addedFeedbackMs, addedLabel } from '../content/cart';
import { cartBadgeText, cartLabelFor } from '../content/header';
import { isCartOffer } from './cart-limits';
import { cartCount, getCartStore } from './cart-store';

const renderCount = (count: number) => {
	for (const link of document.querySelectorAll<HTMLElement>('[data-cart-link]')) {
		link.setAttribute('aria-label', cartLabelFor(count));
	}
	for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-count]')) {
		badge.textContent = cartBadgeText(count);
		badge.hidden = count === 0;
	}
};

const announce = (message: string) => {
	const region = document.querySelector<HTMLElement>('[data-cart-live]');
	// Clear first so announcing the same sentence twice is still read out.
	if (region) {
		region.textContent = '';
		requestAnimationFrame(() => (region.textContent = message));
	}
};

// Buttons showing their "Adicionado" state, with the timer that restores the label.
const restoring = new WeakMap<HTMLElement, { label: string | null; timer: number }>();

const showAdded = (button: HTMLElement) => {
	const pending = restoring.get(button);
	if (pending) window.clearTimeout(pending.timer);
	const label = pending ? pending.label : button.textContent;
	button.textContent = addedLabel;
	button.setAttribute('data-added', '');
	const timer = window.setTimeout(() => {
		button.textContent = label;
		button.removeAttribute('data-added');
		restoring.delete(button);
	}, addedFeedbackMs);
	restoring.set(button, { label, timer });
};

export const initCart = (): void => {
	const store = getCartStore();

	// Marks the page as cart-capable: the add buttons stay hidden until then (`in-data-cart-ready:`),
	// so without JavaScript there is no dead button.
	document.documentElement.setAttribute('data-cart-ready', '');

	renderCount(cartCount(store.getState()));
	store.subscribe((state) => renderCount(cartCount(state)));

	document.addEventListener('click', (event) => {
		const button = (event.target as Element).closest<HTMLElement>('[data-add-to-cart]');
		if (!button) return;
		const { robot, offer } = button.dataset;
		if (!robot || !isCartOffer(offer)) return;
		store.getState().add(robot, offer);
		showAdded(button);
		announce(addedAnnouncement);
	});
};
