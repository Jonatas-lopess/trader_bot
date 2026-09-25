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
			 * Selects the checkout-session driver (modules/billing/factory.ts,
			 * docs/adr/0005-stripe-test-driver.md). Unset or anything but the
			 * literal `"stripe"` resolves to Appmax — the committed production
			 * gateway (ADR-0003). `"stripe"` is a test-only stopgap for while
			 * Appmax onboarding is blocked, never set in production. Not a
			 * wrangler.jsonc `var` — same reason as `APPMAX_WEBHOOK_IPS` below:
			 * that would generate a literal `"appmax"` TS type tied to whatever
			 * default is committed, which can't then also allow `"stripe"`.
			 */
			PAYMENT_PROVIDER?: 'appmax' | 'stripe';
			/** Stripe secret key, test mode only (modules/billing/stripe-client.ts). Unset by default — the Stripe driver fails closed the same way Appmax's own credentials do when absent. */
			STRIPE_SECRET_KEY: string;
			/** Signs Stripe webhook deliveries (modules/billing/stripe-webhook.ts) — verified the same way Stripe's own docs specify, unlike Appmax's unverified signature story. */
			STRIPE_WEBHOOK_SECRET: string;
			/** Resend API key (modules/identity/resend-client.ts). Test mode/sending until PLANNING.md §12's domain-verification prerequisite lands. */
			RESEND_API_KEY: string;
			/** HMAC key signing the session cookie (modules/identity/session.ts) — never stored, only verified against. */
			SESSION_SECRET: string;
			/**
			 * Comma-separated Appmax webhook source IPs (modules/billing/webhook-hardening.ts).
			 * Not a wrangler.jsonc `var` — that generates a literal TS type tied to
			 * whatever's committed, wrong for something meant to differ per
			 * environment. Unset/empty fails closed (rejects every IP) rather than
			 * fail open — a go-live gate (PLANNING.md §12), not a build blocker.
			 */
			APPMAX_WEBHOOK_IPS?: string;
			/** Sentry DSN (sentry.server.config.ts). Unset locally/pre-account — Sentry.withSentry's `enabled` gates on its presence, no behavior change either way. */
			SENTRY_DSN?: string;
		}
	}
	// `@astrojs/cloudflare`'s own generated Worker handler types its `env`
	// param against the bare global `Env`, not `Cloudflare.Env` — only
	// relevant to sentry.server.config.ts, which wraps that handler directly.
	// Extends rather than duplicates the secrets declared above.
	interface Env extends Cloudflare.Env {}
}

export {};
