import { describe, expect, it } from 'vitest';
import { nextRadioIndex } from './radio-group';

describe('nextRadioIndex', () => {
	it('moves forward on ArrowDown and ArrowRight, wrapping at the end', () => {
		for (const key of ['ArrowDown', 'ArrowRight']) {
			expect(nextRadioIndex(key, 0, 3)).toBe(1);
			expect(nextRadioIndex(key, 2, 3)).toBe(0);
		}
	});

	it('moves back on ArrowUp and ArrowLeft, wrapping at the start', () => {
		for (const key of ['ArrowUp', 'ArrowLeft']) {
			expect(nextRadioIndex(key, 2, 3)).toBe(1);
			expect(nextRadioIndex(key, 0, 3)).toBe(2);
		}
	});

	it('jumps to the ends on Home and End', () => {
		expect(nextRadioIndex('Home', 2, 3)).toBe(0);
		expect(nextRadioIndex('End', 0, 3)).toBe(2);
	});

	it('stays put with a single row', () => {
		expect(nextRadioIndex('ArrowDown', 0, 1)).toBe(0);
		expect(nextRadioIndex('ArrowUp', 0, 1)).toBe(0);
	});

	it('ignores other keys and an empty group', () => {
		expect(nextRadioIndex('Tab', 0, 3)).toBeNull();
		expect(nextRadioIndex('a', 0, 3)).toBeNull();
		expect(nextRadioIndex('ArrowDown', 0, 0)).toBeNull();
	});
});
