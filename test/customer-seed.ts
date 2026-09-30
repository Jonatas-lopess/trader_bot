import { env } from 'cloudflare:workers';

// Attaches an existing purchase to a Cliente (migration 0011): find-or-create by email, then
// `purchases.customer_id`. Emails are stored as given, so pass them already normalized.
export async function seedCustomer(params: { purchaseId: string; customerId: string; email: string }): Promise<void> {
	await env.DB.prepare('INSERT INTO customers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
		.bind(params.customerId, params.email)
		.run();
	await env.DB.prepare('UPDATE purchases SET customer_id = (SELECT id FROM customers WHERE email = ?) WHERE id = ?')
		.bind(params.email, params.purchaseId)
		.run();
}
