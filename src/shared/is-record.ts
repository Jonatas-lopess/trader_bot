/** A plain JSON object (not `null`, not an array): what untrusted request and gateway bodies are checked against. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
