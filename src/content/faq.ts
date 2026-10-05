/**
 * FAQ content — heading and six Q&A items for the landing page's
 * `faq-section` band (frame `6:160`,
 * `.scratch/marketing-pages/issues/08-landing-plan-teaser-and-faq.md`,
 * updated for the catalog by `.scratch/catalog-pivot/issues/10-copy-and-docs-sweep.md`).
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
 *  - "Posso cancelar a qualquer momento?" — direct rewrite, scoped to the
 *    Mensal Oferta (catalog-pivot 10): Compra is a single payment and
 *    Anual does not auto-renew in 0.1 (ADR-0006), so only a Mensal
 *    Assinatura can be cancelled. PLANNING.md §6 records Appmax ships no
 *    self-service portal, so the cancel UI is this project's own build
 *    (customer area, §1).
 *  - "Posso pedir reembolso?" — launch-blocked (withdrawal-guarantee 03): the
 *    CDC art. 49 7-day withdrawal, scoped per Oferta, linking the Termos clause.
 *  - "Quais formas de pagamento vocês aceitam?" — factual, per ADR-0006:
 *    Compra and Anual accept card, Boleto and Pix (single payment); Mensal
 *    is card only (recurring). No installments in 0.1.
 *
 *   grep -rn "launchBlocking(" src/content/faq.ts
 */

import { launchBlocking, type LaunchBlocking } from '../shared/launch-blocking';
import { withdrawalHref } from './legal';
import { supportMailto } from './support';

export const heading = 'Perguntas Frequentes';

export type FaqLink = { label: string; href: string };

export type FaqItem = {
	question: string;
	answer: string | LaunchBlocking<string>;
	/** Rendered under the answer. */
	links?: FaqLink[];
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
		// Direct rewrite, not launchBlocking — factual-accuracy correction.
		// Scoped to Mensal: Compra is one payment for a perpetual Licença and
		// Anual is one payment for 12 months with no auto-renew in 0.1
		// (ADR-0006), so neither has anything to cancel. The 7-day
		// withdrawal is the next question.
		answer:
			'Na Oferta Mensal, sim. O cancelamento é feito diretamente pela área do cliente, ' +
			'sem precisar abrir chamado de suporte: a Assinatura deixa de renovar no próximo ' +
			'ciclo e a Licença ativa permanece válida até a data de expiração já concedida. ' +
			'A Compra e a Oferta Anual são pagamentos únicos, sem renovação automática, então ' +
			'não há assinatura a cancelar.',
	},
	{
		question: 'Posso pedir reembolso?',
		// withdrawal-guarantee 03: CDC art. 49 right, stated where the Cliente looks for the
		// cancel question. Scoped per Oferta (cancel is Mensal-only; the 7 days is not).
		// "Desistir da compra", never "garantia".
		answer: launchBlocking(
			'Sim, você tem 7 dias para desistir da compra, a contar da data do pagamento, e o valor ' +
				'pago é reembolsado. Na Compra e na Oferta Anual, os 7 dias valem para o pagamento ' +
				'único. Na Oferta Mensal, valem para a primeira cobrança; cancelar a Assinatura ' +
				'(pergunta acima) só interrompe as renovações seguintes. Para pedir, fale com o ' +
				'suporte por e-mail.',
			'CDC art. 49 / ADR-0006 Withdrawal: wording is a placeholder a lawyer confirms. Open for ' +
				'the owner (.scratch/withdrawal-guarantee/issues/04-owner-decisions.md): whether the ' +
				'7 days count from purchase or from delivery of the Licença, and how Mensal renewals ' +
				'are covered. The request path is the support e-mail until withdrawal-guarantee 02 lands.',
		),
		links: [
			{ label: 'Direito de arrependimento nos Termos de uso', href: withdrawalHref },
			{ label: 'Falar com o suporte', href: supportMailto() },
		],
	},
	{
		question: 'Quais formas de pagamento vocês aceitam?',
		// Matches ADR-0006: Compra and Anual are single payments (card,
		// Boleto, Pix); Mensal recurs on card only (no recurring Pix or
		// Boleto). 0.1 ships no installment option.
		answer:
			'Na Compra e na Oferta Anual (pagamento único) aceitamos cartão de crédito à vista, ' +
			'boleto bancário e Pix. A Oferta Mensal, que é recorrente, aceita apenas cartão de ' +
			'crédito. Por enquanto, cada cobrança é feita em uma única vez — não há opção de ' +
			'dividir o valor em várias cobranças.',
	},
];
