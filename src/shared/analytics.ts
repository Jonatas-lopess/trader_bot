/**
 * Cloudflare Web Analytics beacon token — PLANNING.md §3 (cookieless
 * analytics, no consent banner needed) and §12 (no domain, nothing
 * deployed yet, so no real site token exists).
 *
 * Reads from the PUBLIC_CF_BEACON_TOKEN build-time env var rather than
 * committing a placeholder token as if it were real. Resolves to
 * `undefined` until that var is set, and the layout skips rendering the
 * beacon script entirely in that case.
 *
 * TODO(deploy): once the domain in PLANNING.md §12 is registered and
 * Cloudflare Web Analytics is enabled for the zone, put the generated
 * site token in PUBLIC_CF_BEACON_TOKEN — in the Cloudflare Workers/Pages
 * project's build environment for production, and in a local `.env` for
 * anyone who needs to see the beacon fire in dev.
 */
export const cfBeaconToken: string | undefined = import.meta.env.PUBLIC_CF_BEACON_TOKEN;
