/**
 * Browser script of `/encomenda` (storefront-v2 14; markup in src/pages/encomenda.astro).
 *
 * Posts the form as JSON to `POST /encomenda/enviar`, shows the field errors the endpoint's stable
 * codes map to (the wording comes from the page's `#encomenda-copy` JSON, built from
 * src/content/encomenda.ts) and swaps in the success panel with the "Continuar no WhatsApp" link.
 */

type FieldErrors = Record<string, string>;
type Copy = {
	fieldErrors: FieldErrors;
	formErrorSummary: string;
	rateLimitedMessage: string;
	serverErrorMessage: string;
	submitLabel: string;
	submittingLabel: string;
};

export function initEncomendaForm(): void {
	const form = document.getElementById('encomenda-form') as HTMLFormElement | null;
	const copy: Copy | null = JSON.parse(document.getElementById('encomenda-copy')?.textContent ?? 'null');

	if (form && copy) {
		const submit = document.getElementById('encomenda-submit') as HTMLButtonElement;
		const formError = document.getElementById('encomenda-form-error') as HTMLElement;
		const success = document.getElementById('encomenda-success') as HTMLElement;
		const whatsapp = document.getElementById('encomenda-whatsapp') as HTMLAnchorElement;

		// DOM order, so focus lands on the first field in error. `contact` (neither e-mail nor
		// phone) marks both inputs and shows its message under the phone field.
		const fieldOrder = ['name', 'email', 'phone', 'strategy', 'market', 'corretora', 'consent'];
		const controlsFor = (field: string): string[] => (field === 'contact' ? ['email', 'phone'] : [field]);
		const errorSlot = (field: string): string => (field === 'contact' ? 'phone' : field);

		const control = (name: string) => document.getElementById(`encomenda-${name}`) as HTMLElement | null;
		const slot = (name: string) => document.getElementById(`encomenda-${name}-error`) as HTMLElement | null;

		const clearErrors = () => {
			formError.hidden = true;
			formError.textContent = '';
			for (const name of fieldOrder) {
				control(name)?.removeAttribute('aria-invalid');
				const el = slot(name);
				if (el) {
					el.hidden = true;
					el.textContent = '';
				}
			}
		};

		const showFieldErrors = (errors: FieldErrors) => {
			const invalid = new Set<string>();
			for (const [field, code] of Object.entries(errors)) {
				const el = slot(errorSlot(field));
				if (el) {
					el.textContent = copy.fieldErrors[code] ?? copy.serverErrorMessage;
					el.hidden = false;
				}
				for (const name of controlsFor(field)) {
					control(name)?.setAttribute('aria-invalid', 'true');
					invalid.add(name);
				}
			}
			// The e-mail input also points at the phone slot when the shared contact message is shown.
			if (errors.contact) {
				const phoneDescription = 'encomenda-phone-error';
				const email = control('email');
				const current = email?.getAttribute('aria-describedby') ?? '';
				if (email && !current.includes(phoneDescription)) email.setAttribute('aria-describedby', `${current} ${phoneDescription}`.trim());
			}
			formError.textContent = copy.formErrorSummary;
			formError.hidden = false;
			const first = fieldOrder.find((name) => invalid.has(name));
			if (first) control(first)?.focus();
		};

		const showFormError = (message: string) => {
			formError.textContent = message;
			formError.hidden = false;
			formError.focus();
		};

		form.addEventListener('submit', async (event) => {
			event.preventDefault();
			clearErrors();
			submit.disabled = true;
			submit.textContent = copy.submittingLabel;
			form.setAttribute('aria-busy', 'true');

			try {
				const response = await fetch('/encomenda/enviar', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(Object.fromEntries(new FormData(form))),
				});
				const body = (await response.json().catch(() => ({}))) as {
					ok?: boolean;
					whatsappHref?: string | null;
					fieldErrors?: FieldErrors;
				};

				if (response.ok && body.ok) {
					form.hidden = true;
					if (typeof body.whatsappHref === 'string' && body.whatsappHref.startsWith('https://wa.me/')) {
						whatsapp.href = body.whatsappHref;
						whatsapp.hidden = false;
					}
					success.hidden = false;
					success.focus();
					return;
				}
				if (response.status === 422 && body.fieldErrors) showFieldErrors(body.fieldErrors);
				else if (response.status === 429) showFormError(copy.rateLimitedMessage);
				else showFormError(copy.serverErrorMessage);
			} catch {
				showFormError(copy.serverErrorMessage);
			} finally {
				submit.disabled = false;
				submit.textContent = copy.submitLabel;
				form.removeAttribute('aria-busy');
			}
		});
	}
}
