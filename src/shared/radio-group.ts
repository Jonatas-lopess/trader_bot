/**
 * Keyboard model of a radio group (WAI-ARIA APG): which row a key moves to.
 * Pure so it can be unit-tested; used by the card's price rows
 * (src/components/robot-card.astro, figma-restyle 13).
 */

/** Index the key moves to, wrapping at both ends; null when the key is not one the group handles. */
export const nextRadioIndex = (key: string, current: number, count: number): number | null => {
	if (count <= 0) return null;
	switch (key) {
		case 'ArrowDown':
		case 'ArrowRight':
			return (current + 1) % count;
		case 'ArrowUp':
		case 'ArrowLeft':
			return (current - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
};
