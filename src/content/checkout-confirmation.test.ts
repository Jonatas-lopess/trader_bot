import { describe, expect, it } from 'vitest';
import {
	boletoOverdueRetryLabel,
	confirmationMessages,
	formatDeadline,
	formatDueDate,
	orderItems,
	pendingTimeoutRetry,
	rejectedMessage,
	withdrawalNotice,
} from './checkout-confirmation';
import { withdrawalHref } from './legal';
import { supportMailto } from './support';

describe('checkout confirmation copy', () => {
	it('rejected copy is launch-blocked, says the payment was received, and never invites a second purchase', () => {
		expect(rejectedMessage.blocked).toBe(true);
		expect(confirmationMessages.rejected).toBe(rejectedMessage.value);
		expect(rejectedMessage.value).toMatch(/recebemos o seu pagamento/i);
		expect(rejectedMessage.value).not.toMatch(/tente novamente|compre novamente|nova compra/i);
	});

	it('the pending-timeout retry starts a new checkout from the catalog', () => {
		expect(pendingTimeoutRetry.href).toBe('/catalog');
	});

	it('the paid-confirmation withdrawal sentence is launch-blocked, says 7 dias para desistir da compra, never "garantia"', () => {
		expect(withdrawalNotice.text.blocked).toBe(true);
		expect(withdrawalNotice.text.reason).toMatch(/art\. 49/);
		expect(withdrawalNotice.text.value).toMatch(/7 dias para desistir da compra/);
		expect(withdrawalNotice.text.value).not.toMatch(/garantia/i);
	});

	it('the withdrawal sentence points at the Termos clause and the support e-mail (the /conta request link is ticket 02)', () => {
		expect(withdrawalNotice.termosLink.href).toBe(withdrawalHref);
		expect(withdrawalNotice.supportLink.href).toBe(supportMailto());
	});

	it('has a message for every state of the own checkout; card review never says it was paid', () => {
		for (const state of ['awaiting_pix', 'pix_expired', 'boleto_overdue', 'card_in_review'] as const) {
			expect(confirmationMessages[state]).toBeTruthy();
		}
		expect(confirmationMessages.card_in_review).toMatch(/análise/);
		expect(confirmationMessages.card_in_review).not.toMatch(/confirmado|aprovado!/i);
	});

	it('a declined card says it was not authorized, never that it is under review', () => {
		expect(confirmationMessages.card_declined).toMatch(/não foi autorizado/);
		expect(confirmationMessages.card_declined).not.toMatch(/análise/);
	});

	it('formats the Pix deadline and the Boleto due date in Brasília time', () => {
		expect(formatDeadline('2026-10-17T02:59:59.000Z')).toBe('16/10/2026 às 23:59');
		expect(formatDueDate('2026-10-19')).toBe('19/10/2026');
	});

	it('the withdrawal sentence is not folded into the state messages (it shows on the paid state only)', () => {
		for (const message of Object.values(confirmationMessages)) {
			expect(message).not.toMatch(/desistir/i);
		}
	});

	it('the order list labels each line with its Oferta and number of Licenças', () => {
		expect(orderItems.heading).not.toBe('');
		expect(orderItems.detail('Compra', 2)).toMatch(/2 licenças/);
	});

	it('the rejected copy covers every Licença of the order', () => {
		expect(rejectedMessage.value).toMatch(/suas Licenças/);
	});

	it('never calls what was bought a "pedido" (CONTEXT.md: Compra, Carrinho, Licença)', () => {
		for (const text of [...Object.values(confirmationMessages), boletoOverdueRetryLabel, orderItems.heading]) {
			expect(text).not.toMatch(/pedido/i);
		}
	});
});
