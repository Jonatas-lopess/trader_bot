import { env } from 'cloudflare:workers';
import { seedCustomer } from './customer-seed';
import { putLicenseBinary } from './robot-binary-fixture';

// Seeds the rows a delivery test needs for one Licença: purchase, customer, licenses row and
// (by default) the compiled binary in R2. `license_id` = `purchase_id` (migration 0008), and the
// Cliente's id is `cust-<id>`.
export async function seedLicense(
	id: string,
	options: {
		email?: string;
		licenseStatus?: 'awaiting_account' | 'preparing' | 'active';
		purchaseStatus?: string;
		expiresAt?: string;
		uploadBinary?: boolean;
	} = {}
): Promise<{ licenseId: string; customerId: string; email: string }> {
	const email = options.email ?? `${id}@example.com`;
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, 'starter', 'one_time', 0, ?)")
		.bind(id, options.purchaseStatus ?? 'active')
		.run();
	await seedCustomer({ purchaseId: id, customerId: `cust-${id}`, email });
	await env.DB.prepare(
		'INSERT INTO licenses (purchase_id, robot_id, corretora_account, status, expires_at) VALUES (?, ?, 123456, ?, ?)'
	)
		.bind(id, 'starter', options.licenseStatus ?? 'active', options.expiresAt ?? '9999-12-31T23:59:59.000Z')
		.run();
	if (options.uploadBinary ?? true) await putLicenseBinary(id);
	return { licenseId: id, customerId: `cust-${id}`, email };
}
