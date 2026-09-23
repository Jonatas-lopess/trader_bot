import { describe, expect, it } from 'vitest';
import { launchBlocking } from './launch-blocking';

describe('launchBlocking', () => {
	it('carries the value through unchanged', () => {
		const wrapped = launchBlocking('Resultados consistentes', 'CDC art. 37 — performance claim');

		expect(wrapped.value).toBe('Resultados consistentes');
	});

	it('always marks the item as blocked', () => {
		const wrapped = launchBlocking(42, 'placeholder metric');

		expect(wrapped.blocked).toBe(true);
	});

	it('keeps the human-readable reason', () => {
		const wrapped = launchBlocking(['a', 'b'], 'invented testimonials, PLANNING.md §2');

		expect(wrapped.reason).toBe('invented testimonials, PLANNING.md §2');
	});
});
