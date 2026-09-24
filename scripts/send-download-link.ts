/**
 * Ops-run CLI: mints a download token for a Cliente and emails the link —
 * .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md. No admin HTTP
 * route, no auto-trigger off the webhook (PLANNING.md §8 — "issuance has a
 * human in it", same shape as manual license issuance).
 *
 * Usage: pnpm run send-download-link -- --customer-id=<id> [--origin=<url>]
 *
 * Runs outside the Workers runtime via Wrangler's `getPlatformProxy` (the
 * `wrangler` package, already a devDependency) to obtain the same local
 * D1/R2 bindings `wrangler dev` uses, combined with Node's native TypeScript
 * support (`--experimental-strip-types`; engines requires >=22.12.0) so this
 * runs as a plain `.ts` file with no new runtime dependency (no tsx,
 * ts-node, or CLI-parsing library for a script this small).
 */

import { getPlatformProxy } from 'wrangler';
import { dispatchDownloadLink } from '../src/modules/licensing/dispatch.ts';

// `robotrader.com.br` is the same not-yet-registered domain
// `modules/licensing/resend-client.ts` and `modules/identity/resend-client.ts`
// already use as a placeholder (PLANNING.md §12 — a go-live gate, not a
// build blocker). Override with --origin for a local `wrangler dev` run or
// the workers.dev URL during test-phase staging.
const DEFAULT_ORIGIN = 'https://robotrader.com.br';

function parseArg(argv: string[], name: string): string | null {
	const prefix = `--${name}=`;
	const flag = argv.find((arg) => arg.startsWith(prefix));
	return flag !== undefined ? flag.slice(prefix.length) : null;
}

async function main() {
	const argv = process.argv.slice(2);
	const customerId = parseArg(argv, 'customer-id');
	if (customerId === null || customerId === '') {
		console.error('Usage: pnpm run send-download-link -- --customer-id=<id> [--origin=<url>]');
		process.exitCode = 1;
		return;
	}
	// Empty string (`--origin=` with nothing after it, e.g. from an unset
	// shell variable expanding into the flag) must fall back the same way a
	// missing flag does — `??` alone only catches `null` (code review
	// finding).
	const originArg = parseArg(argv, 'origin');
	const origin = originArg === null || originArg === '' ? DEFAULT_ORIGIN : originArg;

	const proxy = await getPlatformProxy<Cloudflare.Env>({
		configPath: new URL('../wrangler.jsonc', import.meta.url).pathname,
	});
	try {
		const result = await dispatchDownloadLink(proxy.env, { customerId, origin });
		if (!result.ok) {
			console.error(`Could not send download link: ${result.reason}`);
			process.exitCode = 1;
			return;
		}
		console.log(`Download link sent to ${result.email}: ${result.downloadUrl}`);
	} catch (error) {
		// `sendDownloadLinkEmail` (mirroring `identity/resend-client.ts`) only
		// catches an HTTP-level failure, not a network-level one (DNS, timeout,
		// TLS) — that throws past `dispatchDownloadLink`. A token may already
		// be minted by this point; report it plainly instead of an unhandled
		// rejection's raw stack trace (code review finding).
		console.error(`Could not send download link: unexpected error — ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	} finally {
		await proxy.dispose();
	}
}

await main();
