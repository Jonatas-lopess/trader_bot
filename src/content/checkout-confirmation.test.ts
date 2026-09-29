import { describe, expect, it } from 'vitest';
import { confirmationMessages, pendingTimeoutRetry, rejectedMessage } from './checkout-confirmation';

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
});
