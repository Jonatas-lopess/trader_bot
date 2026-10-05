import { describe, expect, it } from 'vitest';
import {
	confirmationMessages,
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

	it('the withdrawal sentence is not folded into the state messages (it shows on the paid state only)', () => {
		for (const message of Object.values(confirmationMessages)) {
			expect(message).not.toMatch(/desistir/i);
		}
	});
});
