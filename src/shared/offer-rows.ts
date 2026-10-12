/**
 * Browser-side radio behaviour of the price rows in the "Saiba mais" modal
 * (src/components/robot-dialog.astro; figma-restyle 13's radio group moved here by
 * storefront-v2 06). The keyboard model is the pure `nextRadioIndex` in radio-group.ts.
 */

import { nextRadioIndex } from './radio-group';

/**
 * Turns a plain list of `[data-offer-row]` items into a radio group: roving tabindex, arrow keys,
 * the selected row wears `data-selected`. `onSelect` runs for every selection, including the
 * initial one, so the caller can point its buy link and cart button at the row's Oferta.
 * Without this call the rows stay a plain list and the server-rendered default row stays selected.
 */
export const enhanceOfferRows = (group: HTMLElement, onSelect: (row: HTMLElement) => void): void => {
	const rows = Array.from(group.querySelectorAll<HTMLElement>('[data-offer-row]'));
	if (rows.length === 0) return;

	group.setAttribute('role', 'radiogroup');
	const label = group.dataset.radiogroupLabel;
	if (label) group.setAttribute('aria-label', label);
	group.toggleAttribute('data-selectable', true);

	const select = (index: number, focus: boolean) => {
		rows.forEach((row, i) => {
			const on = i === index;
			row.toggleAttribute('data-selected', on);
			row.setAttribute('aria-checked', String(on));
			row.tabIndex = on ? 0 : -1;
		});
		const row = rows[index];
		if (!row) return;
		onSelect(row);
		// preventScroll: choosing a price must never move the dialog's own scroll.
		if (focus) row.focus({ preventScroll: true });
	};

	rows.forEach((row, i) => {
		row.setAttribute('role', 'radio');
		// Keep the mouse from focusing (and scrolling) natively; select() focuses without scrolling.
		row.addEventListener('mousedown', (e) => e.preventDefault());
		row.addEventListener('click', () => select(i, true));
		row.addEventListener('keydown', (e) => {
			if (e.key === ' ' || e.key === 'Enter') {
				select(i, true);
			} else {
				const next = nextRadioIndex(e.key, i, rows.length);
				if (next === null) return;
				select(next, true);
			}
			e.preventDefault();
			e.stopPropagation();
		});
	});

	const initial = rows.findIndex((row) => row.hasAttribute('data-selected'));
	select(Math.max(initial, 0), false);
};
