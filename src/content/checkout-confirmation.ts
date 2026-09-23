/**
 * Copy for the intermediate confirmation page (`/checkout/confirmacao`) —
 * .scratch/checkout-webhooks/issues/05-intermediate-confirmation-page.md,
 * PLANNING.md §7 "Checkout sequence". Real product copy, ships as drawn —
 * not launch-blocked (nothing here is a metric, a testimonial or a
 * performance claim; see docs/agents/content-files.md).
 */

export const confirmationHeading = 'Confirmando seu pagamento';

// Keyed by SubscriptionState (src/modules/billing/status.ts) — kept as a
// literal union here rather than importing that type, so this content file
// doesn't reach into modules/billing for it.
export const confirmationMessages: Record<
	'pending' | 'active' | 'past_due' | 'canceled' | 'awaiting_boleto',
	string
> = {
	pending: 'Aguardando confirmação do pagamento…',
	awaiting_boleto:
		'Recebemos seu Boleto. A confirmação pode levar até 1 dia útil — avisaremos por e-mail assim que o pagamento for confirmado.',
	active: 'Pagamento confirmado!',
	past_due:
		'Houve um problema com a cobrança. Entre em contato com o suporte para regularizar sua Assinatura.',
	canceled: 'Este checkout foi cancelado.',
};

// The login destination is out of scope here (magic-link login is a
// separate backlog item, PLANNING.md §1) — same "no destination yet" class
// as src/content/dead-links.ts's `login` entry, rendered inert the same way
// by src/pages/checkout/confirmacao.astro, just with this page's own wording
// per PLANNING.md §7 rather than dead-links.ts's generic "Login".
export const activeCtaLabel = 'Entrar na área do cliente';

export const missingReferenceMessage =
	'Não encontramos esse checkout. Volte à página de planos e tente novamente.';
