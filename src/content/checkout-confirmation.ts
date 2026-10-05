import { launchBlocking } from '../shared/launch-blocking';
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
	'Recebemos o seu pagamento, mas ele precisa de uma verificação manual antes de liberar a sua Licença. Nossa equipe entrará em contato por e-mail. Não é necessário pagar novamente; se preferir, fale com o suporte.',
	'ADR-0006 / PLANNING.md §6 Price integrity: placeholder copy for a paid-but-rejected purchase (amount mismatch); needs support-channel and legal wording before launch.'
);

// Shown under the "Pagamento confirmado!" message once the purchase is `active`
// (withdrawal-guarantee 03). How to request: the support e-mail for now; the request link on
// /conta is ticket 02, not built. "Desistir da compra", never "garantia".
export const withdrawalNotice = {
	text: launchBlocking(
		'Você tem 7 dias para desistir da compra. Para pedir, escreva para o suporte:',
		'CDC art. 49 / ADR-0006 Withdrawal: tells the paid Cliente about the 7-day withdrawal and how to ' +
			'request it; wording is a placeholder a lawyer confirms, and the request path is the support ' +
			'e-mail until withdrawal-guarantee 02 lands.',
	),
	supportLink: { label: supportEmail.value, href: supportMailto() },
	termosLink: { label: 'Direito de arrependimento nos Termos de uso', href: withdrawalHref },
};

// Keyed by PurchaseState (src/modules/billing/status.ts) — kept as a
// literal union here rather than importing that type, so this content file
// doesn't reach into modules/billing for it.
export const confirmationMessages: Record<
	'pending' | 'rejected' | 'active' | 'past_due' | 'canceled' | 'refunded' | 'chargeback' | 'awaiting_boleto',
	string
> = {
	pending: 'Aguardando confirmação do pagamento…',
	awaiting_boleto:
		'Recebemos seu Boleto. A confirmação pode levar até 1 dia útil — avisaremos por e-mail assim que o pagamento for confirmado.',
	active: 'Pagamento confirmado!',
	past_due:
		'Houve um problema com a cobrança. Entre em contato com o suporte para regularizar sua cobrança.',
	canceled: 'Este checkout foi cancelado.',
	rejected: rejectedMessage.value,
	refunded: 'Este pagamento foi reembolsado.',
	chargeback: 'Este pagamento foi contestado junto ao seu banco.',
};

// The login destination is out of scope here (magic-link login is a
// separate backlog item, PLANNING.md §1) — same "no destination yet" class
// as src/content/dead-links.ts's `login` entry, rendered inert the same way
// by src/pages/checkout/confirmacao.astro, just with this page's own wording
// per PLANNING.md §7 rather than dead-links.ts's generic "Login".
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
