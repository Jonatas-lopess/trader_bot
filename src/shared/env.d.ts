// Secrets not declared in wrangler.jsonc (set via `wrangler secret put`, or
// `.dev.vars` locally — see `.dev.vars.example`), so `wrangler types` can't
// discover them on its own. Merged onto the generated Cloudflare.Env here,
// same technique as test/env.d.ts's TEST_MIGRATIONS.
declare global {
	namespace Cloudflare {
		interface Env {
			/** Appmax OAuth2 client id (modules/billing/appmax-client.ts). No sandbox credentials exist yet — see that file's header comment. */
			APPMAX_CLIENT_ID: string;
			APPMAX_CLIENT_SECRET: string;
			/**
			 * Comma-separated Appmax webhook source IPs (modules/billing/webhook-hardening.ts).
			 * Not a wrangler.jsonc `var` — that generates a literal TS type tied to
			 * whatever's committed, wrong for something meant to differ per
			 * environment. Unset/empty fails closed (rejects every IP) rather than
			 * fail open — a go-live gate (PLANNING.md §12), not a build blocker.
			 */
			APPMAX_WEBHOOK_IPS?: string;
		}
	}
}

export {};
