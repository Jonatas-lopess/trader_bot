/**
 * FAQ content — heading and five Q&A items for the landing page's
 * `faq-section` band (frame `6:160`,
 * `.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md`).
 *
 * See `docs/agents/content-files.md` for the typed-content-file and
 * launch-blocking conventions this follows, consumed by
 * `src/components/faq-section.astro`.
 *
 * Four of the frame's five answers made commitments PLANNING.md doesn't
 * back yet (ticket 08, `.scratch/marketing-pages/spec.md` → "Carried by
 * the tickets, not resolved by them"). Per item:
 *
 *  - "É seguro?" — the frame's "Totalmente seguro" is an unqualified
 *    absolute-safety claim, which the footer's own AVISO LEGAL contradicts
 *    (execution risk sits with the Cliente). The underlying substance (no
 *    withdrawal authorisation, funds stay at the Corretora) is accurate
 *    and kept — this is a direct rewrite dropping only the absolute, not a
 *    launchBlocking wrap.
 *  - "Quais corretoras são compatíveis?" — launch-blocked: no verified
 *    Corretora compatibility list exists anywhere in this repo, and the
 *    frame's claim (major global Forex houses plus national/international
 *    crypto exchanges) overstates what a single MT5 Expert Advisor
 *    actually supports (CONTEXT.md — Robô; PLANNING.md §8).
 *  - "Preciso de experiência anterior?" — launch-blocked: promises
 *    pre-tuned configurations and full Portuguese-language tutorials, a
 *    documentation/tutorial deliverable absent from every milestone in
 *    PLANNING.md §10.
 *  - "Posso cancelar a qualquer momento?" — direct rewrite. PLANNING.md §6
 *    records Pagar.me ships no self-service portal, so any cancellation UI
 *    is this project's own build, and §1 keeps the customer area (where
 *    cancellation lives) in 0.1 scope, not yet built — described modestly
 *    here rather than promising a specific interaction. Plan upgrade/
 *    downgrade is 1.0.0 (§10) and is not mentioned.
 *  - "Quais formas de pagamento vocês aceitam?" — the fifth item (the
 *    ticket names four specific problems out of "five items (`6:165`)");
 *    a factual payment-methods answer, matching PLANNING.md §6 exactly
 *    (card à vista + boleto recurring, Pix one-time only, no
 *    installments in 0.1) — no launchBlocking needed, it ships only what
 *    §6 already commits to.
 *
 *   grep -rn "launchBlocking(" src/content/faq.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';

export const heading = 'Perguntas Frequentes';

export type FaqItem = {
	question: string;
	answer: string | LaunchBlocking<string>;
};

export const faqItems: FaqItem[] = [
	{
		question: 'É seguro?',
		// Kept: no withdrawal authorisation, funds stay at the Corretora
		// (matches src/content/footer.ts → legalNotice). Dropped: the
		// frame's unqualified "Totalmente seguro" — operating in financial
		// markets carries risk that this answer does not paper over.
		answer:
			'O Robô Trader nunca tem autorização para sacar ou movimentar o seu dinheiro: os ' +
			'fundos permanecem sempre na sua Corretora, sob seu controle. Isso elimina um risco ' +
			'específico, mas não elimina os riscos normais de operar no mercado financeiro — a ' +
			'execução das ordens enviadas pelo Robô e os resultados delas são de responsabilidade ' +
			'do Cliente, como detalhado no aviso legal no rodapé desta página.',
	},
	{
		question: 'Quais corretoras são compatíveis?',
		answer: launchBlocking(
			'Hoje o Robô Trader é compatível com Corretoras que oferecem a plataforma MetaTrader ' +
				'5.',
			'No verified Corretora compatibility list exists anywhere in this repo. The frame\'s ' +
				'claim (major global Forex houses plus national/international crypto exchanges) ' +
				'overstates what a single MT5 Expert Advisor supports (CONTEXT.md — Robô; ' +
				'PLANNING.md §8 — one program, no crypto-market milestone). The value shipped here ' +
				'is the honest MT5-compatibility baseline, not the frame\'s expansive claim — owner ' +
				'decision: publish a verified list, or narrow this answer further. ' +
				'.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md.',
		),
	},
	{
		question: 'Preciso de experiência anterior?',
		answer: launchBlocking(
			'Não. O Robô Trader já vem com configurações pré-ajustadas e contamos com tutoriais ' +
				'completos em português para te ajudar a começar.',
			'Tutorial/documentation deliverable ("configurações pré-ajustadas e tutoriais ' +
				'completos em português") is not in any 0.1 or 1.0.0 milestone (PLANNING.md §10). ' +
				'Owner decision: commit the docs deliverable to a milestone, or cut this promise. ' +
				'.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md.',
		),
	},
	{
		question: 'Posso cancelar a qualquer momento?',
		// Direct rewrite, not launchBlocking — factual-accuracy correction
		// (same register as ticket 05's step-4 fix in
		// src/content/how-it-works.ts). PLANNING.md §6: Pagar.me has no
		// self-service portal, so cancellation UI is this project's own
		// build, and §1 keeps the customer area in 0.1 scope. Described
		// modestly rather than promising a specific interaction ("um
		// clique") the customer area doesn't yet exist to deliver. No
		// mention of plan upgrade/downgrade — that is 1.0.0 (§10).
		answer:
			'Sim. O cancelamento é feito diretamente pela área do cliente, sem precisar abrir ' +
			'chamado de suporte. Ao cancelar, sua Assinatura deixa de renovar no próximo ciclo e a ' +
			'Licença ativa permanece válida até a data de expiração já concedida.',
	},
	{
		question: 'Quais formas de pagamento vocês aceitam?',
		// Matches PLANNING.md §6 exactly: card à vista and boleto can carry
		// a recurring Assinatura, Pix is one-time only (no recurring Pix on
		// Pagar.me or a Brazilian Stripe account), and 0.1 ships no
		// installment option. No launchBlocking — this states only what §6
		// already commits to.
		answer:
			'Aceitamos cartão de crédito à vista, boleto bancário e Pix. Cartão à vista e boleto ' +
			'podem manter sua Assinatura recorrente; o Pix está disponível apenas para pagamento ' +
			'único, sem recorrência automática. Por enquanto, cada cobrança é feita em uma única ' +
			'vez — não há opção de dividir o valor em várias cobranças.',
	},
];
