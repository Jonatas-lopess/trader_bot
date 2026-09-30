/**
 * One active Licença per Cliente per Robô — .scratch/catalog-pivot/issues/07-customer-area-license-states.md,
 * ADR-0006. Checkout blocks a logged-in Cliente who already holds one, but a guest has no
 * session to check, so a second payment can land. This runs when a purchase first provisions
 * its Cliente: the Cliente was charged, so nothing is refused automatically — the purchase is
 * reported for operator review (refund or keep) instead.
 */

import * as Sentry from '@sentry/cloudflare';
import { normalizeEmail } from '../identity/normalize-email';

type LicensingEnv = Pick<Cloudflare.Env, 'DB'>;

/** The other purchase already holding a live Licença for this email and Robô, or null. */
export async function findDuplicateLicense(
	env: LicensingEnv,
	params: { purchaseId: string; email: string; now?: Date }
): Promise<string | null> {
	const email = normalizeEmail(params.email);
	if (email === null) return null;
	const row = await env.DB.prepare(
		`SELECT other.id AS id
		 FROM purchases mine
		 JOIN purchases other ON other.robot_id = mine.robot_id AND other.id != mine.id
		 JOIN customers c ON c.id = other.customer_id
		 JOIN licenses l ON l.purchase_id = other.id
		 WHERE mine.id = ? AND c.email = ?
		   AND other.status IN ('active', 'past_due', 'canceled')
		   AND l.expires_at > ?
		 LIMIT 1`
	)
		.bind(params.purchaseId, email, (params.now ?? new Date()).toISOString())
		.first<{ id: string }>();
	return row?.id ?? null;
}

/**
 * Advisory only: never throws, since it runs between provisioning and the magic-link send and a
 * failure here must not cost the Cliente their login link (a redelivery sees `created: false`
 * and skips the send).
 */
export async function reportDuplicateLicense(env: LicensingEnv, params: { purchaseId: string; email: string }): Promise<void> {
	try {
		const existingPurchaseId = await findDuplicateLicense(env, params);
		if (existingPurchaseId === null) return;
		console.error(
			`duplicate Licença: purchase ${params.purchaseId} duplicates ${existingPurchaseId} (same Cliente email and Robô) — operator review`
		);
		Sentry.captureMessage('Duplicate Licença for the same Cliente and Robô', {
			extra: { purchase_id: params.purchaseId, existing_purchase_id: existingPurchaseId },
		});
	} catch (error) {
		console.error('reportDuplicateLicense failed', error);
	}
}
