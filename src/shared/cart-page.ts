/**
 * Browser script of `/carrinho` (storefront-v2 09; markup in src/pages/carrinho.astro). The page
 * is the cart view (src/shared/cart-view.ts) activated at load; the header Popover (18) mounts
 * the same view and activates it each time it opens.
 */

import { mountCartView } from './cart-view';

export const initCartPage = (): void => {
	const root = document.querySelector<HTMLElement>('[data-cart-page]');
	if (root) mountCartView(root)?.activate();
};
