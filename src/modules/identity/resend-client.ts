/**
 * The one outbound-fetch seam to Resend's API — spec.md's Testing Decisions
 * ("only the outbound Appmax fetch and the outbound Resend fetch mocked")
 * mocks exactly this module's boundary, mirroring `modules/billing/appmax-client.ts`'s
 * "one seam" convention. Plain `fetch`, no SDK (PLANNING.md §3 — "Workers
 * cannot open SMTP connections", §12 — Resend, test mode until domain
 * verification lands).
 *
 * From-address uses Resend's shared test sender (`onboarding@resend.dev`) because
 * `robotrader.com.br` is not a verified Resend domain yet (PLANNING.md §12, a
 * go-live gate, not a build blocker). Swap back to `login@robotrader.com.br`
 * once that domain's SPF/DKIM verification lands — tracked in PLANNING.md §12
 * item 3 and .scratch/backlog.md.
 */

import { magicLinkEmail } from '../../content/emails';
import { renderEmail } from '../../shared/email-template';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Robô Trader <onboarding@resend.dev>';

type ResendCredentials = Pick<Cloudflare.Env, 'RESEND_API_KEY'>;

export type SendMagicLinkEmailResult = { ok: boolean; detail?: string };

/**
 * Resend's error body is `{ name, message, statusCode }`. Parsed defensively:
 * an empty or non-JSON body (proxy error page, network edge) falls back to
 * the HTTP status rather than throwing, so a broken API key (401/403) stays
 * distinguishable from a rejected recipient (422).
 */
async function readRejectionDetail(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { name?: unknown; message?: unknown };
		const parts = [body.name, body.message].filter((p): p is string => typeof p === 'string' && p !== '');
		return parts.length > 0 ? parts.join(': ') : `HTTP ${response.status}`;
	} catch {
		return `HTTP ${response.status}`;
	}
}

export async function sendMagicLinkEmail(
	env: ResendCredentials,
	params: { to: string; magicLinkUrl: string }
): Promise<SendMagicLinkEmailResult> {
	const email = renderEmail(magicLinkEmail, { url: params.magicLinkUrl });
	const response = await fetch(RESEND_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: FROM_ADDRESS,
			to: [params.to],
			...email,
		}),
	});
	if (response.ok) return { ok: true };
	return { ok: false, detail: await readRejectionDetail(response) };
}
