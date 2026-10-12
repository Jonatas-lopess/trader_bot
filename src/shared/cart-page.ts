/**
 * Browser script of `/carrinho` (storefront-v2 09; markup in src/pages/carrinho.astro).
 *
 * Reads the cart store, asks `POST /cart/summary` to price its lines from D1 and renders them
 * from the page's `<template>` with text nodes only: names are admin-entered, so nothing is ever
 * set through innerHTML. The store holds no price; every price on screen comes from the response
 * and is display only (checkout reads the real price again, ADR-0006). Changing a quantity or
 * removing a line writes the store; the store's subscription re-prices, so the totals always come
 * back through the server.
 */

import {
	decreaseLabel,
	increaseLabel,
	removeLabelFor,
	unavailableLabel,
	unavailableNote,
	unitPriceSuffix,
} from '../content/cart';
import { formatBrl, offerLabels } from '../content/catalog-page';
import type { CartSummary, PricedLine } from '../modules/catalog/price-cart';
import { MAX_QUANTITY, getCartStore } from './cart-store';

type PageState = 'loading' | 'empty' | 'error' | 'ready';

// A burst of quantity clicks becomes one request: the endpoint is rate limited per IP.
const REPRICE_DELAY_MS = 150;

const isSummary = (value: unknown): value is CartSummary =>
	typeof value === 'object' &&
	value !== null &&
	Array.isArray((value as CartSummary).lines) &&
	typeof (value as CartSummary).totalCents === 'number';

export const initCartPage = (): void => {
	const page = document.querySelector<HTMLElement>('[data-cart-page]');
	const template = document.querySelector<HTMLTemplateElement>('[data-cart-line-template]');
	const list = document.querySelector<HTMLElement>('[data-cart-lines]');
	const total = document.querySelector<HTMLElement>('[data-cart-total]');
	const note = document.querySelector<HTMLElement>('[data-cart-unavailable-note]');
	const retry = document.querySelector<HTMLButtonElement>('[data-cart-retry]');
	if (!page || !template || !list || !total || !note) return;

	const store = getCartStore();

	const show = (state: PageState) => {
		for (const panel of page.querySelectorAll<HTMLElement>('[data-cart-state]')) {
			panel.hidden = panel.dataset.cartState !== state;
		}
	};

	const key = (robot: string, offer: string) => `${robot}|${offer}`;

	const fill = (line: PricedLine): HTMLElement => {
		const item = (template.content.cloneNode(true) as DocumentFragment).querySelector<HTMLElement>('[data-cart-line]')!;
		const field = (name: string) => item.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
		// The slug stands in for the name of a Robô the catalog does not publish.
		const label = line.name ?? line.robot;
		item.dataset.robot = line.robot;
		item.dataset.offer = line.offer;
		field('name').textContent = label;
		field('offer').textContent = offerLabels[line.offer];
		field('quantity').textContent = String(line.quantity);

		const decrease = item.querySelector<HTMLButtonElement>('[data-action="decrease"]')!;
		const increase = item.querySelector<HTMLButtonElement>('[data-action="increase"]')!;
		const remove = item.querySelector<HTMLButtonElement>('[data-action="remove"]')!;
		decrease.setAttribute('aria-label', decreaseLabel(label));
		increase.setAttribute('aria-label', increaseLabel(label));
		remove.setAttribute('aria-label', removeLabelFor(label));
		decrease.disabled = line.quantity <= 1;
		increase.disabled = line.quantity >= MAX_QUANTITY;

		if (line.available && line.lineCents !== null && line.unitCents !== null) {
			field('line-price').textContent = formatBrl(line.lineCents);
			field('unit-price').textContent = line.quantity > 1 ? `${formatBrl(line.unitCents)} ${unitPriceSuffix}` : '';
		} else {
			// Unavailable: no price, no stepper, only "Remover".
			item.toggleAttribute('data-unavailable', true);
			field('unavailable').hidden = false;
			field('unavailable').textContent = unavailableLabel;
			field('stepper').hidden = true;
			field('prices').hidden = true;
		}
		return item;
	};

	const render = (summary: CartSummary) => {
		// Focus survives a re-render: the same control, else the page container.
		const active = document.activeElement as HTMLElement | null;
		const focused = active && list.contains(active) ? active : null;
		const focusKey = focused?.closest<HTMLElement>('[data-cart-line]');
		const focusAction = focused?.dataset.action;
		const focusSelector = focusKey ? `[data-robot="${focusKey.dataset.robot}"][data-offer="${focusKey.dataset.offer}"]` : null;

		list.replaceChildren(...summary.lines.map(fill));
		total.textContent = formatBrl(summary.totalCents);
		const hasUnavailable = summary.lines.some((l) => !l.available);
		note.hidden = !hasUnavailable;
		note.textContent = hasUnavailable ? unavailableNote : '';
		show('ready');

		if (focused) {
			const next =
				(focusSelector && focusAction
					? list.querySelector<HTMLElement>(`${focusSelector} [data-action="${focusAction}"]:not(:disabled)`)
					: null) ?? null;
			(next ?? page).focus({ preventScroll: true });
		}
	};

	let sequence = 0;
	let timer: number | undefined;

	const reprice = async () => {
		const lines = store.getState().lines;
		if (lines.length === 0) {
			sequence++;
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
			if (!isSummary(data)) throw new Error('cart summary failed');
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
		const line = store.getState().lines.find((l) => key(l.robot, l.offer) === key(robot ?? '', offer ?? ''));
		if (!line) return;
		const { setQuantity, remove } = store.getState();
		if (button.dataset.action === 'decrease') setQuantity(line.robot, line.offer, line.quantity - 1);
		else if (button.dataset.action === 'increase') setQuantity(line.robot, line.offer, line.quantity + 1);
		else if (button.dataset.action === 'remove') remove(line.robot, line.offer);
	});

	retry?.addEventListener('click', () => {
		show('loading');
		void reprice();
	});

	store.subscribe(scheduleReprice);
	void reprice();
};
