import { cartCheckoutHref, isCartOffer } from '../shared/cart-limits';
import { launchBlocking } from '../shared/launch-blocking';
import { checkoutHref } from './catalog-page';
import { summary } from './checkout-form';
import { withdrawalHref } from './legal';
import { supportEmail, supportMailto } from './support';

/**
 * Copy for the intermediate confirmation page (`/checkout/confirmacao`) —
 * .scratch/checkout-webhooks/issues/05-intermediate-confirmation-page.md,
 * PLANNING.md §7 "Checkout sequence". Real product copy, ships as drawn —
 * not launch-blocked (nothing here is a metric, a testimonial or a
 * performance claim; see docs/agents/content-files.md).
 */

export const pageTitle = 'Confirmando seu pagamento';
export const pageDescription =
	'Acompanhe a confirmação do pagamento da sua compra do Robô Trader.';

export const confirmationHeading = 'Confirmando seu pagamento';

// PLANNING.md §6 Price integrity: the Cliente *was* charged, so this never says
// otherwise and never invites a second purchase. Wording is legal/support-facing.
export const rejectedMessage = launchBlocking(
	'Recebemos o seu pagamento, mas ele precisa de uma verificação manual antes de liberarmos as Licenças do seu pedido. Nossa equipe entrará em contato por e-mail. Não é necessário pagar novamente; se preferir, fale com o suporte.',
	'ADR-0006 / PLANNING.md §6 Price integrity: placeholder copy for a paid-but-rejected purchase (amount mismatch); needs support-channel and legal wording before launch.'
);

// Shown under the "Pagamento confirmado!" message once the purchase is `active`
// (withdrawal-guarantee 03). How to request: the support e-mail, not the "Solicitar arrependimento"
// link on /conta (ticket 02): this page is public and /conta needs a login, so the e-mail works
// for every buyer. "Desistir da compra", never "garantia".
export const withdrawalNotice = {
	text: launchBlocking(
		'Você tem 7 dias para desistir da compra. Para pedir, escreva para o suporte:',
		'CDC art. 49 / ADR-0006 Withdrawal: tells the paid Cliente about the 7-day withdrawal and how to ' +
			'request it; wording is a placeholder a lawyer confirms.',
	),
	supportLink: { label: supportEmail.value, href: supportMailto() },
	termosLink: { label: 'Direito de arrependimento nos Termos de uso', href: withdrawalHref },
};

// Keyed by PurchaseState (src/modules/billing/status.ts) — kept as a
// literal union here rather than importing that type, so this content file
// doesn't reach into modules/billing for it. The Pix, Boleto-overdue and card-review states
// come from the own Appmax checkout (appmax-checkout 06, ADR-0007).
export const confirmationMessages: Record<
	| 'pending'
	| 'rejected'
	| 'active'
	| 'past_due'
	| 'canceled'
	| 'refunded'
	| 'chargeback'
	| 'awaiting_boleto'
	| 'boleto_overdue'
	| 'awaiting_pix'
	| 'pix_expired'
	| 'card_in_review'
	| 'card_declined',
	string
> = {
	pending: 'Aguardando confirmação do pagamento…',
	awaiting_boleto:
		'Recebemos seu Boleto. A confirmação pode levar até 1 dia útil — avisaremos por e-mail assim que o pagamento for confirmado.',
	boleto_overdue:
		'O vencimento deste Boleto passou. Se você já pagou, a confirmação pode levar até 1 dia útil e avisaremos por e-mail. Se ainda não pagou, faça um novo pedido.',
	awaiting_pix:
		'Pague com o Pix abaixo. Assim que o pagamento for confirmado, esta página se atualiza sozinha e o acesso chega por e-mail.',
	pix_expired: 'O prazo deste Pix acabou e ele não pode mais ser pago. Gere um novo Pix para concluir a compra.',
	// `autorizado` is antifraud review, not payment (PLANNING.md §13): never says it was paid.
	card_in_review:
		'Seu pagamento com cartão está em análise. Avisaremos por e-mail assim que ele for aprovado, e esta página se atualiza sozinha.',
	// Appmax refused the card (appmax-checkout 05): nothing to wait for, the retry is a new checkout.
	card_declined: 'O pagamento com cartão não foi autorizado. Tente de novo com outro cartão ou outra forma de pagamento.',
	active: 'Pagamento confirmado!',
	past_due:
		'Houve um problema com a cobrança. Entre em contato com o suporte para regularizar sua cobrança.',
	canceled: 'Este checkout foi cancelado.',
	rejected: rejectedMessage.value,
	refunded: 'Este pagamento foi reembolsado.',
	chargeback: 'Este pagamento foi contestado junto ao seu banco.',
};

// The login destination is out of scope here (magic-link login is a
// separate backlog item, PLANNING.md §1) — rendered inert by
// src/pages/checkout/confirmacao.astro, with this page's own wording per
// PLANNING.md §7.
export const activeCtaLabel = 'Entrar na área do cliente';

export const missingReferenceMessage =
	'Não encontramos esse checkout. Volte ao catálogo e tente novamente.';

// Shown in place of confirmationMessages.pending once polling has run past
// PENDING_TIMEOUT_MS (src/pages/checkout/confirmacao.astro) without the
// webhook confirming — polling keeps running in the background regardless,
// this only changes what's on screen while the customer waits.
export const pendingTimeoutMessage =
	'Isso está demorando mais que o esperado. Se o pagamento for confirmado, atualizamos esta página automaticamente. Se você não concluiu o pagamento, pode tentar novamente ou falar com o suporte.';

// A stale `pending` row is inert and never resumed (a cancelled Appmax order or an
// expired Pix stays `pending`): the retry is a brand-new checkout from the catalog.
export const pendingTimeoutRetry = { label: 'Tentar novamente', href: '/catalog' } as const;

// Pix and Boleto instructions (appmax-checkout 06), rendered from what the pay endpoint stored.
export const pixInstructions = {
	qrAlt: 'QR Code do Pix',
	codeLabel: 'Pix copia e cola',
	copyLabel: 'Copiar código',
	copiedLabel: 'Código copiado',
	copyFailedLabel: 'Não foi possível copiar. O código está selecionado: copie pelo seu aparelho.',
	deadlineLabel: 'Pague até',
} as const;

export const boletoInstructions = {
	pdfLabel: 'Abrir o Boleto (PDF)',
	lineLabel: 'Linha digitável',
	copyLabel: 'Copiar linha digitável',
	copiedLabel: 'Linha digitável copiada',
	copyFailedLabel: 'Não foi possível copiar. A linha está selecionada: copie pelo seu aparelho.',
	dueLabel: 'Vencimento',
} as const;

// An expired Pix or an overdue Boleto is never resumed: the retry is a new checkout of what was
// bought (the same Robô and Oferta, or every line of a cart), like `pendingTimeoutRetry`.
export const pixExpiredRetryLabel = 'Gerar novo Pix';
export const cardDeclinedRetryLabel = 'Tentar de novo';
export const boletoOverdueRetryLabel = 'Fazer um novo pedido';

/**
 * A new checkout of what the order held: the single-item checkout for one Licença, the cart
 * checkout (`/checkout?line=...`, storefront-v2 11) for more; the catalog when there is nothing
 * to rebuild or an Oferta the checkout does not sell.
 */
export function newCheckoutHref(items: readonly { robotId: string; offer: string; quantity: number }[]): string {
	if (items.length === 0 || !items.every((item) => isCartOffer(item.offer))) return pendingTimeoutRetry.href;
	const lines = items.map((item) => ({ robot: item.robotId, offer: item.offer as 'one_time' | 'annual', quantity: item.quantity }));
	if (lines.length === 1 && lines[0].quantity === 1) return checkoutHref(lines[0].robot, lines[0].offer);
	return cartCheckoutHref(lines);
}

// What the order holds (storefront-v2 13): one line per Robô and Oferta, worded like the
// checkout summary (one source, checkout-form.ts).
export const orderItems = {
	heading: 'Seu pedido',
	detail: summary.lineDetail,
} as const;

// Brasília is fixed UTC-3 (no DST), the same clock as `formatPurchaseDate` in conta.ts.
const inBrasilia = (iso: string) => new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-10-17T02:59:59.000Z` → "16/10/2026 às 23:59". */
export function formatDeadline(iso: string): string {
	const d = inBrasilia(iso);
	return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `2026-10-19` → "19/10/2026". */
export function formatDueDate(day: string): string {
	const [year, month, date] = day.split('-');
	return `${date}/${month}/${year}`;
}
