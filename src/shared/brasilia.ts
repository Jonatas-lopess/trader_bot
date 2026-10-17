/**
 * Brasília time is fixed UTC-3 all year (no daylight saving since 2019). The one place that fact
 * lives: dates shown to the Cliente, the withdrawal window's days and Appmax's zone-less local
 * timestamps (assumed Brasília, unverified, appmax-checkout 08) are all counted on this clock.
 */

/** The offset as an ISO 8601 zone suffix, for reading a Brasília wall-clock string as an instant. */
export const BRASILIA_UTC_OFFSET = '-03:00';

const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;

/** The instant shifted onto the Brasília clock, so its UTC fields (`getUTCDate`, `getUTCHours`...) read as Brasília wall time. */
export function toBrasiliaClock(instant: string | Date): Date {
	return new Date(new Date(instant).getTime() + BRASILIA_OFFSET_MS);
}
