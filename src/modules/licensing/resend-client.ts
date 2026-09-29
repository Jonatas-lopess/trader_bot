/**
 * The one outbound-fetch seam to Resend's API for the download-link email —
 * its own module boundary under `modules/licensing`, mirroring (not
 * reusing/importing) `modules/identity/resend-client.ts`'s shape, per
 * .scratch/robot-delivery/issues/02-mint-dispatch-redeem.md. Plain `fetch`,
 * no SDK (PLANNING.md §3 — "Workers cannot open SMTP connections", §12 —
 * Resend test mode until domain verification lands).
 *
 * From-address is illustrative, same placeholder-domain caveat as
 * `identity/resend-client.ts`'s header — `robotrader.com.br` is not a
 * verified Resend domain yet (PLANNING.md §12, a go-live gate, not a build
 * blocker).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Robô Trader <entrega@robotrader.com.br>';

type ResendCredentials = Pick<Cloudflare.Env, 'RESEND_API_KEY'>;

export type SendDownloadLinkEmailResult = { ok: boolean; detail?: string };

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

export async function sendDownloadLinkEmail(
	env: ResendCredentials,
	params: { to: string; downloadUrl: string }
): Promise<SendDownloadLinkEmailResult> {
	const response = await fetch(RESEND_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: FROM_ADDRESS,
			to: [params.to],
			subject: 'Seu Robô Trader está pronto para baixar',
			html: `<p>Clique no link abaixo para baixar o Robô Trader. O link expira em 48 horas e pode ser usado mais de uma vez dentro desse prazo.</p><p><a href="${params.downloadUrl}">${params.downloadUrl}</a></p>`,
			text: `Clique no link abaixo para baixar o Robô Trader. O link expira em 48 horas e pode ser usado mais de uma vez dentro desse prazo.\n\n${params.downloadUrl}`,
		}),
	});
	if (response.ok) return { ok: true };
	return { ok: false, detail: await readRejectionDetail(response) };
}
