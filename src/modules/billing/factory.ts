/**
 * Picks the `IPaymentProvider` impl at runtime off `env.PAYMENT_PROVIDER`
 * (docs/adr/0005-stripe-test-driver.md). Fails closed to Appmax — the
 * committed production gateway (ADR-0003) — for anything but an explicit
 * `"stripe"`: unset, empty, or a typo'd value all resolve to Appmax rather
 * than silently routing checkout traffic to a test-mode gateway.
 */

import { appmaxProvider } from './appmax-client';
import type { IPaymentProvider } from './payment-provider';
import { stripeProvider } from './stripe-client';

type FactoryEnv = Pick<Cloudflare.Env, 'PAYMENT_PROVIDER'>;

export function selectProvider(env: FactoryEnv): IPaymentProvider {
	return env.PAYMENT_PROVIDER === 'stripe' ? stripeProvider : appmaxProvider;
}
