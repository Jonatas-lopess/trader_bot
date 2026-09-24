/**
 * Mint + send — the "dispatch" concern PLANNING.md §4's module layout lists
 * for `modules/licensing`. Ops-triggered, no auto-trigger off the webhook
 * and no self-service resend for 0.1 (.scratch/robot-delivery/issues/02-mint-dispatch-redeem.md,
 * PLANNING.md §8 — "issuance has a human in it"). The one caller today is
 * `scripts/send-download-link.ts`.
 */

// Explicit `.ts` extensions here (unlike this repo's usual extensionless
// imports): `scripts/send-download-link.ts` reaches this module directly
// through Node's native module loader (no Vite/esbuild bundling step for
// that entry point), which — unlike Astro's bundler-mode resolution
// (tsconfig.json's `moduleResolution: "Bundler"`) — requires a resolvable
// specifier. Astro/Vite and `astro check` (`allowImportingTsExtensions`)
// both accept the extensioned form too, so this isn't a dual-syntax hazard,
// just the one file in this repo's dependency chain that has to satisfy
// both resolvers.
import { getCustomerEmail } from '../identity/customers.ts';
import { mintDownloadToken } from './download-tokens.ts';
import { sendDownloadLinkEmail } from './resend-client.ts';

type DispatchEnv = Pick<Cloudflare.Env, 'DB' | 'RESEND_API_KEY'>;

export type DispatchDownloadLinkResult =
	| { ok: true; email: string; downloadUrl: string }
	| { ok: false; reason: 'customer_not_found' | 'email_failed' };

export async function dispatchDownloadLink(
	env: DispatchEnv,
	params: { customerId: string; origin: string }
): Promise<DispatchDownloadLinkResult> {
	const email = await getCustomerEmail(env, params.customerId);
	if (email === null) return { ok: false, reason: 'customer_not_found' };

	// Minted (and persisted) before the email send is even attempted — a
	// Resend failure below still leaves a valid, usable link an operator can
	// hand the Cliente directly rather than losing the mint on a delivery
	// hiccup.
	const { token } = await mintDownloadToken(env, { customerId: params.customerId });
	const downloadUrl = new URL(`/download/${token}`, params.origin).toString();

	const sent = await sendDownloadLinkEmail(env, { to: email, downloadUrl });
	if (!sent.ok) return { ok: false, reason: 'email_failed' };

	return { ok: true, email, downloadUrl };
}
