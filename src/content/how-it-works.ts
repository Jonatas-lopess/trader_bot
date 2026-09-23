/**
 * "Como funciona" content — badge, heading, and the 4-step row.
 *
 * See `docs/agents/content-files.md` for the typed-content-file convention
 * this follows, consumed by `src/components/how-it-works.astro`. Ticket
 * `.scratch/marketing-pages/issues/05-landing-video-and-steps.md`, frame
 * `6:48`.
 *
 * The ticket's frame copy has three problems this file does not ship
 * as-drawn — see the comments on each step below and
 * `.scratch/marketing-pages/spec.md` → "Carried by the tickets, not
 * resolved by them".
 */

export type HowItWorksStep = {
	number: string;
	title: string;
	description: string;
};

export const badge = 'Simplicidade';

export const heading = 'Configuração rápida em 4 passos';

export const steps: HowItWorksStep[] = [
	{
		number: '01',
		title: 'Escolha seu plano',
		description:
			'Compare os Planos disponíveis e escolha o que combina com o seu volume de ' +
			'operações.',
	},
	{
		number: '02',
		title: 'Instale o robô',
		// Frame copy ("instalação assistida para sistemas operacionais
		// modernos") describes an installer deliverable that no milestone
		// in PLANNING.md §10 contains — the product is an MT5 Expert
		// Advisor, not standalone software. Rewritten to describe what
		// actually ships: adding the Robô to the MT5 platform.
		// .scratch/marketing-pages/issues/05-landing-video-and-steps.md.
		description:
			'Adicione o Robô ao seu MetaTrader 5 seguindo o passo a passo enviado por e-mail ' +
			'com o link de download.',
	},
	{
		number: '03',
		title: 'Configure sua corretora',
		// Frame copy: "Conecte sua conta via chave de API protegida".
		// CONTEXT.md defines Chave as the credential that lets an
		// installed Robô run — not a Corretora API credential. Rephrased
		// below to avoid the literal term "chave de API" so this page does
		// not silently collide with CONTEXT.md's Chave. This does NOT
		// resolve the underlying collision (this ticket doesn't get to);
		// see the open-question note at the bottom of this file and
		// CONTEXT.md → "Open terms".
		description:
			'Conecte sua conta na Corretora usando a credencial de API fornecida por ela, ' +
			'inserida diretamente nas configurações do Robô.',
	},
	{
		number: '04',
		title: 'Deixe o robô operar',
		// Frame copy framed this as "Ative a chave" — implying a Chave
		// arrives with the purchase and the robot starts instantly.
		// Issuance has a human in it (PLANNING.md §8) and boleto adds up
		// to a business day before anything starts (§7). Rewritten so the
		// copy doesn't promise an instant Chave or immediate access.
		// .scratch/marketing-pages/issues/05-landing-video-and-steps.md.
		description:
			'Assim que a Licença for liberada — o que pode levar até 1 dia útil, dependendo ' +
			'da forma de pagamento — o Robô passa a operar sozinho, seguindo os parâmetros ' +
			'que você configurou.',
	},
];

// Open question, not resolved by this file or this ticket: CONTEXT.md
// defines Chave as the credential that lets an installed Robô run. Step 03
// above is about a different secret — the Corretora's own API credential —
// and the original frame called both of them "chave". The step copy here
// sidesteps the collision by not using the literal term "chave de API" for
// the Corretora credential, but the underlying vocabulary gap is still
// open: does the Corretora credential get a name of its own in CONTEXT.md,
// or does "Chave" get scoped/renamed? Tracked in CONTEXT.md → "Open terms"
// and .scratch/marketing-pages/spec.md → "Carried by the tickets, not
// resolved by them" ("Chave means the Robô's run credential in
// CONTEXT.md, but the frames use it for a Corretora API key. Needs a
// CONTEXT.md decision. Ticket 05.").
