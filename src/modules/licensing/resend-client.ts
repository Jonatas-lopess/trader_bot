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

export type SendDownloadLinkEmailResult = { ok: boolean };

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
	return { ok: response.ok };
}
