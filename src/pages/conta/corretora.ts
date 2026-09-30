import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCustomerPurchase } from '../../modules/identity/customers';
import { isSessionValid, requireSession } from '../../modules/identity/session';
import { saveCorretoraAccount } from '../../modules/licensing/corretora-account';

export const prerender = false;

// .scratch/catalog-pivot/issues/07-customer-area-license-states.md: the Cliente binds the
// Corretora account once, after paying. Same guard as /conta/cancelar — a customer-initiated
// write re-validates the session against D1, not just the cookie.
export const POST: APIRoute = async ({ request, url }) => {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (!session.ok) return Response.redirect(new URL('/login', url.origin), 303);

	if (!(await isSessionValid(env, session.sessionId))) {
		return Response.redirect(new URL('/login', url.origin), 303);
	}

	const form = await request.formData();
	const purchaseId = form.get('purchase_id');
	// The purchase id comes from the form; ownership is checked against the session's Cliente.
	const account =
		typeof purchaseId === 'string' ? await getCustomerPurchase(env, session.customerId, purchaseId) : null;
	if (account === null) return Response.redirect(new URL('/conta', url.origin), 303);

	const raw = form.get('corretora_account');
	const result = await saveCorretoraAccount(env, account.purchaseId, typeof raw === 'string' ? raw : '');

	const notice = result.ok ? 'saved' : result.reason === 'invalid' ? 'invalid' : result.reason === 'already_set' ? 'exists' : 'unavailable';
	return Response.redirect(new URL(`/conta?corretora=${notice}`, url.origin), 303);
};
