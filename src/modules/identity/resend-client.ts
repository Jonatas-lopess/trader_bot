/**
 * The one outbound-fetch seam to Resend's API — spec.md's Testing Decisions
 * ("only the outbound Appmax fetch and the outbound Resend fetch mocked")
 * mocks exactly this module's boundary, mirroring `modules/billing/appmax-client.ts`'s
 * "one seam" convention. Plain `fetch`, no SDK (PLANNING.md §3 — "Workers
 * cannot open SMTP connections", §12 — Resend, test mode until domain
 * verification lands).
 *
 * From-address is illustrative — `robotrader.com.br` is not a verified
 * Resend domain yet (PLANNING.md §12, a go-live gate, not a build blocker).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Robô Trader <login@robotrader.com.br>';

type ResendCredentials = Pick<Cloudflare.Env, 'RESEND_API_KEY'>;

export type SendMagicLinkEmailResult = { ok: boolean };

export async function sendMagicLinkEmail(
	env: ResendCredentials,
	params: { to: string; magicLinkUrl: string }
): Promise<SendMagicLinkEmailResult> {
	const response = await fetch(RESEND_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: FROM_ADDRESS,
			to: [params.to],
			subject: 'Seu link de acesso — Robô Trader',
			html: `<p>Clique no link abaixo para entrar na sua área do cliente. O link expira em 15 minutos e só pode ser usado uma vez.</p><p><a href="${params.magicLinkUrl}">${params.magicLinkUrl}</a></p>`,
			text: `Clique no link abaixo para entrar na sua área do cliente. O link expira em 15 minutos e só pode ser usado uma vez.\n\n${params.magicLinkUrl}`,
		}),
	});
	return { ok: response.ok };
}
