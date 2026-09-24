/**
 * Picks the `IPaymentProvider` impl at runtime off `env.PAYMENT_PROVIDER`
 * (docs/adr/0005-stripe-test-driver.md). Fails closed to Appmax — the
 * committed production gateway (ADR-0003) — for anything but an explicit
 * `"stripe"`: unset, empty, or a typo'd value all resolve to Appmax rather
 * than silently routing checkout traffic to a test-mode gateway.
 */

import { appmaxProvider } from './appmax-client';
import type { IPaymentProvider, ProviderId } from './payment-provider';
import { stripeProvider } from './stripe-client';

type FactoryEnv = Pick<Cloudflare.Env, 'PAYMENT_PROVIDER'>;

export function selectProvider(env: FactoryEnv): IPaymentProvider {
	return env.PAYMENT_PROVIDER === 'stripe' ? stripeProvider : appmaxProvider;
}

const providersById: Record<ProviderId, IPaymentProvider> = {
	appmax: appmaxProvider,
	stripe: stripeProvider,
};

/**
 * Looks up a driver by a subscription row's own recorded `provider` —
 * distinct from `selectProvider`, which picks off the *current* env default
 * at checkout time. Cancellation must dispatch to whichever gateway
 * actually created the row, not whatever `PAYMENT_PROVIDER` happens to be
 * set to right now (cancel.ts).
 */
export function providerById(id: ProviderId): IPaymentProvider {
	return providersById[id];
}
