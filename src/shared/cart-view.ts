/**
 * The cart's rendering and behavior, shared by both surfaces (storefront-v2 09 and 18): the
 * `/carrinho` page and the header Popover (src/components/cart-popover.astro). The markup is
 * src/components/cart-view.astro; the text, disabled states and checkout link come from
 * `cart-view-model.ts`.
 *
 * Reads the cart store, asks `POST /cart/summary` to price its lines from D1 and renders them from
 * the view's `<template>` with text nodes only: names are admin-entered, so nothing is ever set
 * through innerHTML. The store holds no price; every price on screen comes from the response and is
 * display only (checkout reads the real price again, ADR-0006). Changing a quantity or removing a
 * line writes the store; the store's subscription re-prices, so the totals always come back
 * through the server. "Finalizar compra" links to the checkout of the store's lines
 * (`cartCheckoutHref`), and is disabled while any line is unavailable.
 *
 * A view does nothing until `activate()`: the page activates at load, the Popover each time it
 * opens, so a page that never opens the Popover makes no summary request.
 */

import { cartCheckoutHref } from './cart-limits';
import { isCartSummary, lineView, summaryView } from './cart-view-model';
import { getCartStore } from './cart-store';
import type { CartSummary, PricedCartLine } from '../modules/catalog/price-cart';

type ViewState = 'loading' | 'empty' | 'error' | 'ready';

// A burst of quantity clicks becomes one request: the endpoint is rate limited per IP.
const REPRICE_DELAY_MS = 150;

export type CartView = {
	/** Starts showing the cart: loading state, a summary request, then re-prices on every store change. */
	activate: () => void;
	/** Stops listening to the store and drops any request still in flight. */
	deactivate: () => void;
};

export const mountCartView = (root: HTMLElement): CartView | null => {
	const template = root.querySelector<HTMLTemplateElement>('[data-cart-line-template]');
	const list = root.querySelector<HTMLElement>('[data-cart-lines]');
	const total = root.querySelector<HTMLElement>('[data-cart-total]');
	const note = root.querySelector<HTMLElement>('[data-cart-unavailable-note]');
	const retry = root.querySelector<HTMLButtonElement>('[data-cart-retry]');
	const checkout = root.querySelector<HTMLAnchorElement>('[data-cart-checkout]');
	if (!template || !list || !total || !note || !checkout) return null;

	const store = getCartStore();

	const show = (state: ViewState) => {
		for (const panel of root.querySelectorAll<HTMLElement>('[data-cart-state]')) {
			panel.hidden = panel.dataset.cartState !== state;
		}
	};

	const fill = (line: PricedCartLine): HTMLElement => {
		const view = lineView(line);
		const item = (template.content.cloneNode(true) as DocumentFragment).querySelector<HTMLElement>('[data-cart-line]')!;
		const field = (name: string) => item.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
		item.dataset.robot = line.robot;
		item.dataset.offer = line.offer;
		field('name').textContent = view.label;
		field('offer').textContent = view.offer;
		field('quantity').textContent = view.quantity;

		const decrease = item.querySelector<HTMLButtonElement>('[data-action="decrease"]')!;
		const increase = item.querySelector<HTMLButtonElement>('[data-action="increase"]')!;
		const remove = item.querySelector<HTMLButtonElement>('[data-action="remove"]')!;
		decrease.setAttribute('aria-label', view.decreaseAria);
		increase.setAttribute('aria-label', view.increaseAria);
		remove.setAttribute('aria-label', view.removeAria);
		decrease.disabled = view.decreaseDisabled;
		increase.disabled = view.increaseDisabled;

		if (view.price) {
			field('line-price').textContent = view.price.line;
			field('unit-price').textContent = view.price.unit;
		} else {
			// Unavailable: no price, no stepper, only "Remover".
			item.toggleAttribute('data-unavailable', true);
			field('unavailable').hidden = false;
			field('unavailable').textContent = view.unavailable;
			field('stepper').hidden = true;
			field('prices').hidden = true;
		}
		return item;
	};

	const render = (summary: CartSummary) => {
		// Focus survives a re-render: the same control, else the view's container.
		const active = document.activeElement as HTMLElement | null;
		const focused = active && list.contains(active) ? active : null;
		const focusKey = focused?.closest<HTMLElement>('[data-cart-line]');
		const focusAction = focused?.dataset.action;
		const focusSelector = focusKey ? `[data-robot="${focusKey.dataset.robot}"][data-offer="${focusKey.dataset.offer}"]` : null;

		const view = summaryView(summary, store.getState().lines);
		list.replaceChildren(...summary.lines.map(fill));
		total.textContent = view.total;
		note.hidden = view.note === null;
		note.textContent = view.note ?? '';
		if (view.checkoutHref === null) {
			checkout.removeAttribute('href');
			checkout.setAttribute('aria-disabled', 'true');
			checkout.setAttribute('aria-describedby', note.id);
		} else {
			checkout.href = view.checkoutHref;
			checkout.removeAttribute('aria-disabled');
			checkout.removeAttribute('aria-describedby');
		}
		show('ready');

		if (focused) {
			const next =
				focusSelector && focusAction
					? list.querySelector<HTMLElement>(`${focusSelector} [data-action="${focusAction}"]:not(:disabled)`)
					: null;
			(next ?? root).focus({ preventScroll: true });
		}
	};

	let sequence = 0;
	let timer: number | undefined;
	let unsubscribe: (() => void) | null = null;

	const reprice = async () => {
		const lines = store.getState().lines;
		if (lines.length === 0) {
			sequence++;
			list.removeAttribute('aria-busy');
			// The last line's button is about to go: keep focus inside the view instead of dropping it to the body.
			if (list.contains(document.activeElement)) root.focus({ preventScroll: true });
			show('empty');
			return;
		}
		const mine = ++sequence;
		list.setAttribute('aria-busy', 'true');
		try {
			const response = await fetch('/cart/summary', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lines }),
			});
			const data: unknown = response.ok ? await response.json() : null;
			if (mine !== sequence) return; // a newer request owns the screen
			if (!isCartSummary(data)) throw new Error('cart summary failed');
			render(data);
		} catch {
			if (mine === sequence) show('error');
		} finally {
			if (mine === sequence) list.removeAttribute('aria-busy');
		}
	};

	const scheduleReprice = () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(reprice, REPRICE_DELAY_MS);
	};

	list.addEventListener('click', (event) => {
		const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
		const item = button?.closest<HTMLElement>('[data-cart-line]');
		if (!button || !item) return;
		const { robot, offer } = item.dataset;
		const line = store.getState().lines.find((l) => l.robot === robot && l.offer === offer);
		if (!line) return;
		const { setQuantity, remove } = store.getState();
		if (button.dataset.action === 'decrease') setQuantity(line.robot, line.offer, line.quantity - 1);
		else if (button.dataset.action === 'increase') setQuantity(line.robot, line.offer, line.quantity + 1);
		else if (button.dataset.action === 'remove') remove(line.robot, line.offer);
	});

	// A quantity click still waiting on its re-price: the link takes what the store holds now.
	checkout.addEventListener('click', () => {
		if (checkout.hasAttribute('href')) checkout.href = cartCheckoutHref(store.getState().lines);
	});

	retry?.addEventListener('click', () => {
		show('loading');
		void reprice();
	});

	return {
		activate: () => {
			show('loading');
			unsubscribe ??= store.subscribe(scheduleReprice);
			void reprice();
		},
		deactivate: () => {
			unsubscribe?.();
			unsubscribe = null;
			window.clearTimeout(timer);
			sequence++;
			list.removeAttribute('aria-busy');
		},
	};
};
