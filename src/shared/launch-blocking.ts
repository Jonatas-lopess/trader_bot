/**
 * Launch-blocking marker.
 *
 * Wraps copy that ships to a frame but is not approved to go live —
 * fabricated metrics, unverified compatibility claims, a headline that
 * reads as a performance guarantee. See `.scratch/marketing-pages/spec.md`
 * → "Carried by the tickets, not resolved by them", and the full writeup
 * of this convention at `docs/agents/content-files.md`.
 *
 * A content file wraps any not-yet-approved string/array in `launchBlocking`
 * instead of exporting it bare. Components render `.value` and otherwise
 * leave the wrapper alone — it flags the source, it does not gate render.
 *
 * When a field is typed `T | LaunchBlocking<T>` (some rows blocked, some
 * not — e.g. a feature-row label), use `unwrapLaunchBlocking` at the render
 * site instead of re-deriving the `typeof x === 'string' ? x : x.value`
 * ternary per component.
 *
 * Every blocked item is discoverable with one command, so keep the call
 * name and shape exact:
 *
 *   grep -rn "launchBlocking(" src/content/
 */

export type LaunchBlocking<T> = {
	value: T;
	blocked: true;
	reason: string;
};

export const launchBlocking = <T>(value: T, reason: string): LaunchBlocking<T> => ({
	value,
	blocked: true,
	reason,
});

const isLaunchBlocking = <T>(value: T | LaunchBlocking<T>): value is LaunchBlocking<T> =>
	typeof value === 'object' && value !== null && 'blocked' in value;

/** Unwraps a `T | LaunchBlocking<T>` field to its plain value, wrapped or not. */
export const unwrapLaunchBlocking = <T>(value: T | LaunchBlocking<T>): T =>
	isLaunchBlocking(value) ? value.value : value;
