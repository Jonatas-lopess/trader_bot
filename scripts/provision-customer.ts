/**
 * Ops-run CLI: manually provisions a `customers` row for a subscription
 * whose webhook activation found no email on Appmax's authoritative
 * re-fetch — the case `billing/webhook.ts`'s `onSubscriptionBecameActive`
 * logs and leaves unprovisioned rather than guessing at (customer-area
 * ticket 08). That Cliente paid, the subscription is `active`, but no
 * `customers` row exists and no magic-link email was ever sent — this
 * script is the recovery path once an operator has found the buyer's real
 * email out-of-band (Appmax's own dashboard, a support ticket).
 *
 * Find candidates with:
 *   SELECT s.id, s.appmax_order_id, s.appmax_subscription_id, s.status
 *   FROM subscriptions s LEFT JOIN customers c ON c.subscription_id = s.id
 *   WHERE s.status = 'active' AND c.id IS NULL;
 * (or grep `onSubscriptionBecameActive: no email field` in Worker logs for
 * the order_id/subscription_id).
 *
 * Usage: pnpm run provision-customer -- --subscription-id=<subscriptions.id> --email=<email> [--origin=<url>]
 *
 * Same `getPlatformProxy`/`--experimental-strip-types` shape as
 * `scripts/send-download-link.ts` — see that file's header for why.
 */

import { getPlatformProxy } from 'wrangler';
import { provisionCustomer } from '../src/modules/identity/customers.ts';
import { issueMagicLink } from '../src/modules/identity/magic-link.ts';

// Same not-yet-registered placeholder domain as `send-download-link.ts`'s
// `DEFAULT_ORIGIN` and both `resend-client.ts` files (PLANNING.md §12 —
// go-live gate, not a build blocker).
const DEFAULT_ORIGIN = 'https://robotrader.com.br';

function parseArg(argv: string[], name: string): string | null {
	const prefix = `--${name}=`;
	const flag = argv.find((arg) => arg.startsWith(prefix));
	return flag !== undefined ? flag.slice(prefix.length) : null;
}

async function main() {
	const argv = process.argv.slice(2);
	const subscriptionId = parseArg(argv, 'subscription-id');
	const email = parseArg(argv, 'email');
	if (subscriptionId === null || subscriptionId === '' || email === null || email === '') {
		console.error(
			'Usage: pnpm run provision-customer -- --subscription-id=<id> --email=<email> [--origin=<url>]'
		);
		process.exitCode = 1;
		return;
	}
	// Empty string falls back the same way a missing flag does, same
	// reasoning as `send-download-link.ts`'s `--origin` handling.
	const originArg = parseArg(argv, 'origin');
	const origin = originArg === null || originArg === '' ? DEFAULT_ORIGIN : originArg;

	const proxy = await getPlatformProxy<Cloudflare.Env>({
		configPath: new URL('../wrangler.jsonc', import.meta.url).pathname,
	});
	try {
		// No FK on `subscription_id` (this codebase's convention, per
		// `migrations/0003_customers.sql`) — `provisionCustomer` would happily
		// insert against a typo'd id, so check it exists first rather than
		// create an orphan row.
		const subscription = await proxy.env.DB.prepare('SELECT id FROM subscriptions WHERE id = ?')
			.bind(subscriptionId)
			.first<{ id: string }>();
		if (subscription === null) {
			console.error(`Could not provision customer: no subscription found for id=${subscriptionId}`);
			process.exitCode = 1;
			return;
		}

		const customer = await provisionCustomer(proxy.env, { subscriptionId, email });
		if (!customer.created) {
			console.log(
				`Subscription ${subscriptionId} already has a customers row (id=${customer.id}) — no new row created, no email sent. The Cliente can already use /login.`
			);
			return;
		}

		const sent = await issueMagicLink(proxy.env, { customerId: customer.id, email, origin });
		if (!sent.ok) {
			console.error(
				`customers row created (id=${customer.id}) but the magic-link email failed to send. The Cliente can now self-serve via /login (their email lookup will match) — retry isn't required, just tell them to try /login.`
			);
			process.exitCode = 1;
			return;
		}
		console.log(`Provisioned customer ${customer.id} for subscription ${subscriptionId} and sent the magic-link login email to ${email}.`);
	} catch (error) {
		// Mirrors `send-download-link.ts`: a network-level failure (DNS,
		// timeout, TLS) throws past `issueMagicLink` rather than resolving to
		// `{ ok: false }`. The `customers` row may already be created by this
		// point even so — report plainly instead of an unhandled rejection's
		// raw stack trace.
		console.error(`Could not provision customer: unexpected error — ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	} finally {
		await proxy.dispose();
	}
}

await main();
