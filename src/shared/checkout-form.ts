/**
 * Browser script of `/checkout` (appmax-checkout 04, ADR-0007; markup in src/pages/checkout.astro).
 *
 * - Validates the buyer fields with the same `normalizeBuyerInput` the pay endpoint runs, so
 *   client and server agree; errors are the module's codes, worded by `#checkout-config`'s copy.
 * - The order's lines (`{robot, offer, quantity}`, never a price) come from `#checkout-config`;
 *   the server prices them again on pay (ADR-0006).
 * - Pix and Boleto post straight to `POST /checkout/pay`. A card first submits the separate
 *   `data-appmax-checkout` form, which Appmax JS tokenizes in the browser; only the token (and
 *   the holder name) is sent on, never the card number or CVV.
 * - One request at a time: the button stays disabled while a payment is in flight, and stays so
 *   on success while the browser navigates to the confirmation page.
 * - A checkout that came from the cart empties the cart store only after the pay endpoint
 *   accepted the payment, right before navigating to the confirmation page (storefront-v2 11);
 *   a failure keeps the cart.
 * - The hidden `reference` changes only when the pay endpoint sends a new one: a declined card
 *   (a refused Appmax order cannot be paid again) or a 502 before any payment was sent. A 502
 *   after the payment call carries none, so the page keeps the reference and the retry replays
 *   that attempt (its confirmation page) instead of risking a second charge.
 */

import { normalizeBuyerInput, type BuyerField } from '../modules/billing/buyer-input';
import type { CartLine } from './cart-limits';
import { getCartStore } from './cart-store';
import { CONFIRMATION_PATH } from './checkout-urls';

type Copy = {
	fieldErrors: Record<string, string>;
	formErrorSummary: string;
	payErrors: Record<string, string>;
	payLabel: string;
	payingLabel: string;
};
type Config = {
	lines: CartLine[];
	fromCart: boolean;
	externalId: string;
	copy: Copy;
};

type AppmaxError = { code?: string; message?: string; stage?: string };
type AppmaxScripts = {
	init(options: {
		externalId: string;
		onTokenize: (result: { token: string }) => void;
		onError: (error: AppmaxError | string) => void;
	}): void;
};

/** How long a card waits for Appmax JS to answer before the page gives up on that attempt. */
const TOKENIZE_TIMEOUT_MS = 30_000;

const BUYER_FIELDS: BuyerField[] = ['name', 'email', 'phone', 'document'];

export function initCheckoutForm(): void {
	const form = document.getElementById('checkout-form') as HTMLFormElement | null;
	const cardForm = document.getElementById('card-form') as HTMLFormElement | null;
	const config: Config | null = JSON.parse(document.getElementById('checkout-config')?.textContent ?? 'null');
	if (!form || !cardForm || !config) return;

	const { copy } = config;
	const submit = document.getElementById('checkout-submit') as HTMLButtonElement;
	const formError = document.getElementById('checkout-error') as HTMLElement;
	const reference = form.elements.namedItem('reference') as HTMLInputElement;

	// Our own guard first: a submit before Appmax JS has bound must never post natively.
	cardForm.addEventListener('submit', (event) => event.preventDefault());

	let pendingToken: { resolve: (token: string) => void; reject: () => void } | null = null;
	const appmax = (window as unknown as { AppmaxScripts?: AppmaxScripts }).AppmaxScripts;
	// Once per page load, on every method: it also collects the client IP (ADR-0007).
	appmax?.init({
		externalId: config.externalId,
		onTokenize: ({ token }) => pendingToken?.resolve(token),
		// IP and fingerprint failures at load do not block Pix or Boleto; only a pending card waits on this.
		onError: () => pendingToken?.reject(),
	});

	const tokenizeCard = (): Promise<string> =>
		new Promise((resolve, reject) => {
			if (!appmax) {
				reject();
				return;
			}
			const timer = setTimeout(() => {
				pendingToken = null;
				reject();
			}, TOKENIZE_TIMEOUT_MS);
			pendingToken = {
				resolve: (token) => {
					clearTimeout(timer);
					pendingToken = null;
					resolve(token);
				},
				reject: () => {
					clearTimeout(timer);
					pendingToken = null;
					reject();
				},
			};
			cardForm.requestSubmit();
		});

	const selectedMethod = (): string => (form.querySelector('input[name="method"]:checked') as HTMLInputElement | null)?.value ?? '';

	const syncMethod = () => {
		cardForm.hidden = selectedMethod() !== 'card';
	};
	form.addEventListener('change', (event) => {
		if ((event.target as HTMLInputElement).name === 'method') syncMethod();
	});
	syncMethod();

	const control = (name: string) => document.getElementById(`checkout-${name}`) as HTMLInputElement | null;
	const slot = (name: string) => document.getElementById(`checkout-${name}-error`) as HTMLElement | null;

	const clearErrors = () => {
		formError.hidden = true;
		formError.textContent = '';
		for (const name of BUYER_FIELDS) {
			control(name)?.removeAttribute('aria-invalid');
			const el = slot(name);
			if (el) {
				el.hidden = true;
				el.textContent = '';
			}
		}
	};

	const showFieldErrors = (errors: Partial<Record<string, string>>) => {
		for (const name of BUYER_FIELDS) {
			const code = errors[name];
			if (code === undefined) continue;
			control(name)?.setAttribute('aria-invalid', 'true');
			const el = slot(name);
			if (el) {
				el.textContent = copy.fieldErrors[code] ?? copy.formErrorSummary;
				el.hidden = false;
			}
		}
		formError.textContent = copy.formErrorSummary;
		formError.hidden = false;
		control(BUYER_FIELDS.find((name) => errors[name] !== undefined) ?? 'name')?.focus();
	};

	const showFormError = (code: string) => {
		formError.textContent = copy.payErrors[code] ?? copy.payErrors.provider_unavailable;
		formError.hidden = false;
		formError.focus();
	};

	let inFlight = false;
	const setBusy = (busy: boolean) => {
		inFlight = busy;
		submit.disabled = busy;
		submit.textContent = busy ? copy.payingLabel : copy.payLabel;
		if (busy) form.setAttribute('aria-busy', 'true');
		else form.removeAttribute('aria-busy');
	};

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (inFlight) return;
		clearErrors();

		const values = new FormData(form);
		const buyer = Object.fromEntries(BUYER_FIELDS.map((name) => [name, String(values.get(name) ?? '')]));
		const checked = normalizeBuyerInput(buyer);
		if (!checked.ok) {
			showFieldErrors(checked.fieldErrors);
			return;
		}

		setBusy(true);
		const method = selectedMethod();
		let card: { token: string; holderName: string } | null = null;
		if (method === 'card') {
			try {
				const token = await tokenizeCard();
				const holderName = String(new FormData(cardForm).get('card-holder-name') ?? '').trim();
				card = { token, holderName };
			} catch {
				setBusy(false);
				showFormError('tokenization_failed');
				return;
			}
		}

		try {
			const response = await fetch('/checkout/pay', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					reference: reference.value,
					lines: config.lines,
					method,
					buyer,
					...(card === null ? {} : { token: card.token, holderName: card.holderName || undefined }),
				}),
			});
			const body = (await response.json().catch(() => ({}))) as {
				ok?: boolean;
				redirectUrl?: string;
				code?: string;
				reference?: string;
				fieldErrors?: Record<string, string>;
			};

			if (response.ok && body.ok && typeof body.redirectUrl === 'string' && body.redirectUrl.startsWith(`${CONFIRMATION_PATH}?`)) {
				if (config.fromCart) getCartStore().getState().clear();
				window.location.assign(body.redirectUrl);
				return;
			}
			// Never minted here: only the server knows whether the failed attempt may have charged.
			if (typeof body.reference === 'string') reference.value = body.reference;
			setBusy(false);
			if (body.code === 'invalid_buyer' && body.fieldErrors) showFieldErrors(body.fieldErrors);
			else if (response.status === 429) showFormError('rate_limited');
			else showFormError(body.code ?? 'provider_unavailable');
		} catch {
			setBusy(false);
			showFormError('network');
		}
	});
}
