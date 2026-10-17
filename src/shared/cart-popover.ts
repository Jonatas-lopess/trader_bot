/**
 * Browser wiring of the header cart Popover (storefront-v2 18; markup in
 * src/components/cart-popover.astro). Started once from `src/components/site-header.astro`.
 *
 * The cart icon is a link to `/carrinho`, which stays its target with scripts off, in a browser
 * without the Popover API, and on `/carrinho` itself (already the cart). Otherwise a plain click
 * opens the Popover and the shared cart view (src/shared/cart-view.ts) starts asking for prices;
 * it stops when the Popover closes. A modified click (new tab, new window) keeps the link.
 * Esc and an outside click close it natively ("light dismiss"); focus goes into the Popover on
 * open and back to the icon on close.
 */

import { mountCartView } from './cart-view';

const GAP_PX = 8;

export const initCartPopover = (): void => {
	const popover = document.getElementById('cart-popover');
	const viewRoot = popover?.querySelector<HTMLElement>('[data-cart-popover-view]');
	if (!popover || !viewRoot || typeof popover.showPopover !== 'function') return;
	if (document.querySelector('[data-cart-page]')) return;
	const view = mountCartView(viewRoot);
	if (!view) return;
	popover.hidden = false;

	const links = document.querySelectorAll<HTMLElement>('[data-cart-link]');
	let trigger: HTMLElement | null = null;
	// Whether a press on the icon found the Popover open. The press light-dismisses it before the
	// click arrives, so the click alone would reopen what the press just closed.
	let openOnPress: boolean | null = null;

	// Fixed to the viewport, under the icon and right-aligned with it; the sheet on a phone ignores `right`.
	const place = () => {
		// The header has two icons, one per breakpoint; a resize can swap which one is shown.
		if (!trigger || trigger.getClientRects().length === 0) {
			trigger = [...links].find((link) => link.getClientRects().length > 0) ?? trigger;
		}
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		popover.style.setProperty('--cart-popover-top', `${rect.bottom + GAP_PX}px`);
		popover.style.setProperty('--cart-popover-right', `${document.documentElement.clientWidth - rect.right}px`);
	};

	const setExpanded = (expanded: boolean) => {
		for (const link of links) link.setAttribute('aria-expanded', String(expanded));
	};

	for (const link of links) {
		link.setAttribute('aria-haspopup', 'dialog');
		link.setAttribute('aria-controls', popover.id);
		link.setAttribute('aria-expanded', 'false');
		link.addEventListener('pointerdown', () => {
			openOnPress = popover.matches(':popover-open');
		});
		// A key press is not a pointer press: drop a press whose click never came (a drag off the icon).
		link.addEventListener('keydown', () => {
			openOnPress = null;
		});
		link.addEventListener('click', (event) => {
			const wasOpen = openOnPress ?? popover.matches(':popover-open');
			openOnPress = null;
			if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			if (wasOpen) {
				if (popover.matches(':popover-open')) popover.hidePopover();
			} else {
				trigger = link;
				place();
				popover.showPopover();
			}
		});
	}

	popover.addEventListener('toggle', (event) => {
		if ((event as ToggleEvent).newState === 'open') {
			setExpanded(true);
			view.activate();
			popover.focus({ preventScroll: true });
		} else {
			setExpanded(false);
			view.deactivate();
			// Esc keeps focus where the browser put it; a click elsewhere has already moved it.
			const active = document.activeElement;
			if (trigger && (active === document.body || (active && popover.contains(active)))) trigger.focus();
		}
	});

	window.addEventListener('resize', () => {
		if (popover.matches(':popover-open')) place();
	});

	// "Continuar comprando" and the empty cart's "Ver o catálogo" close the Popover; on the page
	// they point at, there is nowhere to go, so the click only closes it.
	popover.addEventListener('click', (event) => {
		const link = (event.target as Element).closest<HTMLAnchorElement>('[data-cart-continue]');
		if (!link) return;
		if (link.pathname === location.pathname) event.preventDefault();
		popover.hidePopover();
	});
};
