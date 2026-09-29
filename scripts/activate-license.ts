/**
 * Ops-run CLI: flips a Licença `preparing` -> `active` and emails the download link —
 * .scratch/catalog-pivot/issues/08-per-license-delivery.md. Run after uploading
 * `licenses/<license_id>.ex5` to R2; steps in `docs/ops/license-activation.md`.
 *
 * Usage: pnpm run activate-license -- --license-id=<purchases.id> [--origin=<url>]
 *
 * Same `getPlatformProxy`/`--experimental-strip-types` shape as
 * `scripts/send-download-link.ts` — see that file's header for why.
 */

import { getPlatformProxy } from 'wrangler';
import { activateLicense } from '../src/modules/licensing/activate.ts';

const DEFAULT_ORIGIN = 'https://robotrader.com.br';

function parseArg(argv: string[], name: string): string | null {
	const prefix = `--${name}=`;
	const flag = argv.find((arg) => arg.startsWith(prefix));
	return flag !== undefined ? flag.slice(prefix.length) : null;
}

async function main() {
	const argv = process.argv.slice(2);
	const licenseId = parseArg(argv, 'license-id');
	if (licenseId === null || licenseId === '') {
		console.error('Usage: pnpm run activate-license -- --license-id=<purchases.id> [--origin=<url>]');
		process.exitCode = 1;
		return;
	}
	const originArg = parseArg(argv, 'origin');
	const origin = originArg === null || originArg === '' ? DEFAULT_ORIGIN : originArg;

	const proxy = await getPlatformProxy<Cloudflare.Env>({
		configPath: new URL('../wrangler.jsonc', import.meta.url).pathname,
	});
	try {
		const result = await activateLicense(proxy.env, { licenseId, origin });
		if (!result.ok) {
			console.error(
				`Could not activate license: ${result.reason}` +
					(result.reason === 'email_failed' && result.detail ? ` (${result.detail})` : '')
			);
			if (result.reason === 'email_failed' || result.reason === 'license_not_active') {
				console.error('The Licença may already be active; check it and resend the link with send-download-link.');
			}
			process.exitCode = 1;
			return;
		}
		console.log(`License ${licenseId} active. Download link sent to ${result.email}: ${result.downloadUrl}`);
	} catch (error) {
		console.error(`Could not activate license: unexpected error — ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	} finally {
		await proxy.dispose();
	}
}

await main();
