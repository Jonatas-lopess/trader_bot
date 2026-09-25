/**
 * Stand-in `main` for the test pool only (vitest.config.ts) — tests call
 * exported functions (`handleWebhook`, `checkWebhookRequest`, ...) directly
 * and never hit a fetch handler, so this only needs to exist so miniflare has
 * something loadable to boot bindings against. The real `main`
 * (`sentry.server.config.ts`, wrangler.jsonc) imports
 * `@astrojs/cloudflare/entrypoints/server`, which depends on a Vite virtual
 * module only resolvable inside Astro's own build — miniflare can't load it
 * standalone (sentry-integration/issues/01).
 */
export default {
	fetch() {
		return new Response(null, { status: 404 });
	},
};
