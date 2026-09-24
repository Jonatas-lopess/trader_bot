import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { cancelSubscription } from '../../modules/billing/cancel';
import { getCustomerAccount } from '../../modules/identity/customers';
import { isSessionValid, requireSession } from '../../modules/identity/session';

export const prerender = false;

// .scratch/customer-area/issues/04-cancel-subscription.md: the one other
// place (besides logout) ticket 02's hybrid session design does a D1 check
// — re-validating against `sessions`, not just the cookie, before a
// customer-initiated write.
export const POST: APIRoute = async ({ request, url }) => {
	const session = await requireSession(request, env.SESSION_SECRET);
	if (!session.ok) return Response.redirect(new URL('/login', url.origin), 303);

	if (!(await isSessionValid(env, session.sessionId))) {
		return Response.redirect(new URL('/login', url.origin), 303);
	}

	const account = await getCustomerAccount(env, session.customerId);
	if (account === null) return Response.redirect(new URL('/login', url.origin), 303);

	// The page re-renders with whatever the current status is either way —
	// if the gateway's cancel call failed, status simply didn't change,
	// which is an honest reflection of reality without a separate error
	// page (this repo's generally terse error-handling style elsewhere).
	await cancelSubscription(env, {
		subscriptionId: account.subscriptionId,
		provider: account.provider,
		providerSubscriptionId: account.appmaxSubscriptionId,
	});

	return Response.redirect(new URL('/conta', url.origin), 303);
};
