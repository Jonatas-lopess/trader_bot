/**
 * The one place an email becomes an identity key — .scratch/catalog-pivot/issues/14-identity-per-email.md,
 * ADR-0006 "Identity is per email". `customers.email` is UNIQUE on this value.
 *
 * Deliberately shallow: trim, lowercase, one `@` with both sides non-empty, ASCII only. No Gmail
 * dot/plus folding (plus-aliases stay distinct), no dot rewriting, no regex/DNS/MX validation.
 * Callers reject on `null`; none may fall back to the raw value, or two spellings of one address
 * could become two identities.
 */
export function normalizeEmail(raw: string): string | null {
	const trimmed = raw.trim();
	if (!/^[\x00-\x7F]*$/.test(trimmed)) return null;

	const at = trimmed.lastIndexOf('@');
	if (at === -1) return null;
	const local = trimmed.slice(0, at);
	const domain = trimmed.slice(at + 1);
	if (local === '' || domain === '' || local.includes('@')) return null;

	return trimmed.toLowerCase();
}
