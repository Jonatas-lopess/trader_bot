import { describe, expect, it } from 'vitest';
import { CART_STORAGE_KEY, MAX_LINES, MAX_QUANTITY, cartCount, createCartStore } from './cart-store';

// In-memory stand-in for sessionStorage: the store takes its storage by injection, so these
// tests need no DOM (storefront-v2 08).
const memoryStorage = (initial: Record<string, string> = {}) => {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key),
		data,
	};
};

const persisted = (lines: unknown, version = 1) => JSON.stringify({ state: { lines }, version });

describe('cart store actions', () => {
	it('adds a line', () => {
		const store = createCartStore(memoryStorage());
		store.getState().add('robo-a', 'one_time');
		expect(store.getState().lines).toEqual([{ robot: 'robo-a', offer: 'one_time', quantity: 1 }]);
	});

	it('merges the same Robô and Oferta into one line and counts the units', () => {
		const store = createCartStore(memoryStorage());
		store.getState().add('robo-a', 'one_time');
		store.getState().add('robo-a', 'one_time');
		store.getState().add('robo-a', 'annual');
		expect(store.getState().lines).toEqual([
			{ robot: 'robo-a', offer: 'one_time', quantity: 2 },
			{ robot: 'robo-a', offer: 'annual', quantity: 1 },
		]);
		expect(cartCount(store.getState())).toBe(3);
	});

	it('caps a line at the maximum quantity', () => {
		const store = createCartStore(memoryStorage());
		for (let i = 0; i < MAX_QUANTITY + 3; i++) store.getState().add('robo-a', 'one_time');
		expect(store.getState().lines[0]?.quantity).toBe(MAX_QUANTITY);
	});

	it('refuses a new line past the line limit but still merges into an existing one', () => {
		const store = createCartStore(memoryStorage());
		for (let i = 0; i < MAX_LINES; i++) store.getState().add(`robo-${i}`, 'one_time');
		store.getState().add('one-too-many', 'one_time');
		expect(store.getState().lines).toHaveLength(MAX_LINES);
		store.getState().add('robo-0', 'one_time');
		expect(store.getState().lines[0]?.quantity).toBe(2);
	});

	it('sets a quantity within 1..max and removes the line at zero', () => {
		const store = createCartStore(memoryStorage());
		store.getState().add('robo-a', 'one_time');
		store.getState().setQuantity('robo-a', 'one_time', 4);
		expect(store.getState().lines[0]?.quantity).toBe(4);
		store.getState().setQuantity('robo-a', 'one_time', 99);
		expect(store.getState().lines[0]?.quantity).toBe(MAX_QUANTITY);
		store.getState().setQuantity('robo-a', 'one_time', 0);
		expect(store.getState().lines).toEqual([]);
	});

	it('ignores setQuantity on a line that is not in the cart', () => {
		const store = createCartStore(memoryStorage());
		store.getState().setQuantity('robo-a', 'one_time', 3);
		expect(store.getState().lines).toEqual([]);
	});

	it('removes one line and clears them all', () => {
		const store = createCartStore(memoryStorage());
		store.getState().add('robo-a', 'one_time');
		store.getState().add('robo-b', 'annual');
		store.getState().remove('robo-a', 'one_time');
		expect(store.getState().lines.map((l) => l.robot)).toEqual(['robo-b']);
		store.getState().clear();
		expect(store.getState().lines).toEqual([]);
		expect(cartCount(store.getState())).toBe(0);
	});
});

describe('cart store persistence', () => {
	it('writes under the versioned key and a second store over the same storage reads it back', () => {
		const storage = memoryStorage();
		createCartStore(storage).getState().add('robo-a', 'annual');
		expect(storage.data.has(CART_STORAGE_KEY)).toBe(true);
		expect(CART_STORAGE_KEY).toBe('rt-cart-v1');
		expect(createCartStore(storage).getState().lines).toEqual([{ robot: 'robo-a', offer: 'annual', quantity: 1 }]);
	});

	it('starts empty on empty storage (a new tab)', () => {
		expect(createCartStore(memoryStorage()).getState().lines).toEqual([]);
	});

	it('never writes a price or a name, only robot, offer and quantity', () => {
		const storage = memoryStorage();
		createCartStore(storage).getState().add('robo-a', 'one_time');
		const written = JSON.parse(storage.data.get(CART_STORAGE_KEY)!);
		expect(Object.keys(written.state)).toEqual(['lines']);
		expect(Object.keys(written.state.lines[0]).sort()).toEqual(['offer', 'quantity', 'robot']);
		expect(storage.data.get(CART_STORAGE_KEY)).not.toMatch(/price|cents|name|amount/i);
	});

	it('drops a price or any other field a tampered storage carries on a line', () => {
		const storage = memoryStorage({
			[CART_STORAGE_KEY]: persisted([{ robot: 'robo-a', offer: 'one_time', quantity: 1, priceCents: 1, name: 'x' }]),
		});
		expect(createCartStore(storage).getState().lines).toEqual([{ robot: 'robo-a', offer: 'one_time', quantity: 1 }]);
	});

	it('drops an unknown offer, including monthly', () => {
		const storage = memoryStorage({
			[CART_STORAGE_KEY]: persisted([
				{ robot: 'robo-a', offer: 'monthly', quantity: 1 },
				{ robot: 'robo-b', offer: 'lifetime', quantity: 1 },
				{ robot: 'robo-c', offer: 'annual', quantity: 2 },
			]),
		});
		expect(createCartStore(storage).getState().lines).toEqual([{ robot: 'robo-c', offer: 'annual', quantity: 2 }]);
	});

	it('drops malformed lines and keeps the good ones', () => {
		const storage = memoryStorage({
			[CART_STORAGE_KEY]: persisted([
				null,
				'robo-a',
				{ robot: 7, offer: 'one_time', quantity: 1 },
				{ robot: '', offer: 'one_time', quantity: 1 },
				{ robot: 'Bad Slug!', offer: 'one_time', quantity: 1 },
				{ robot: 'robo-a', offer: 'one_time', quantity: 'many' },
				{ robot: 'robo-a', offer: 'one_time', quantity: 0 },
				{ robot: 'robo-a', offer: 'one_time', quantity: -2 },
				{ robot: 'robo-ok', offer: 'one_time', quantity: 1 },
			]),
		});
		expect(createCartStore(storage).getState().lines).toEqual([{ robot: 'robo-ok', offer: 'one_time', quantity: 1 }]);
	});

	it('clamps an oversized or fractional quantity and merges duplicate lines', () => {
		const storage = memoryStorage({
			[CART_STORAGE_KEY]: persisted([
				{ robot: 'robo-a', offer: 'one_time', quantity: 900 },
				{ robot: 'robo-b', offer: 'one_time', quantity: 2.7 },
				{ robot: 'robo-b', offer: 'one_time', quantity: 1 },
			]),
		});
		expect(createCartStore(storage).getState().lines).toEqual([
			{ robot: 'robo-a', offer: 'one_time', quantity: MAX_QUANTITY },
			{ robot: 'robo-b', offer: 'one_time', quantity: 3 },
		]);
	});

	it('does not crash on content that is not JSON, or JSON of the wrong shape', () => {
		for (const raw of ['{not json', '42', 'null', '"text"', '[]', '{"state":null,"version":1}', '{"state":{"lines":"x"},"version":1}']) {
			const store = createCartStore(memoryStorage({ [CART_STORAGE_KEY]: raw }));
			expect(store.getState().lines).toEqual([]);
			store.getState().add('robo-a', 'one_time');
			expect(store.getState().lines).toHaveLength(1);
		}
	});

	it('reads lines from an older persisted version instead of discarding the cart', () => {
		const storage = memoryStorage({ [CART_STORAGE_KEY]: persisted([{ robot: 'robo-a', offer: 'one_time', quantity: 2 }], 0) });
		expect(createCartStore(storage).getState().lines).toEqual([{ robot: 'robo-a', offer: 'one_time', quantity: 2 }]);
	});

	it('caps the persisted line count', () => {
		const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => ({ robot: `robo-${i}`, offer: 'one_time', quantity: 1 }));
		const storage = memoryStorage({ [CART_STORAGE_KEY]: persisted(many) });
		expect(createCartStore(storage).getState().lines).toHaveLength(MAX_LINES);
	});

	it('works in memory when the storage throws (blocked or full)', () => {
		const throwing = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {},
		};
		const store = createCartStore(throwing);
		store.getState().add('robo-a', 'one_time');
		expect(store.getState().lines).toHaveLength(1);
	});
});
