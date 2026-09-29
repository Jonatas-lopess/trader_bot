import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { saveCorretoraAccount } from './corretora-account';

async function seed(id: string, opts: { purchaseStatus?: string; licenseStatus?: string; account?: number | null; noLicense?: boolean } = {}) {
	await env.DB.prepare("INSERT INTO purchases (id, robot_id, offer, amount_cents, status) VALUES (?, ?, 'one_time', 0, ?)")
		.bind(id, 'starter', opts.purchaseStatus ?? 'active')
		.run();
	if (opts.noLicense) return;
	await env.DB.prepare('INSERT INTO licenses (purchase_id, robot_id, status, corretora_account) VALUES (?, ?, ?, ?)')
		.bind(id, 'starter', opts.licenseStatus ?? 'awaiting_account', opts.account ?? null)
		.run();
}

async function readLicense(id: string) {
	return env.DB.prepare('SELECT status, corretora_account FROM licenses WHERE purchase_id = ?')
		.bind(id)
		.first<{ status: string; corretora_account: number | null }>();
}

describe('saveCorretoraAccount', () => {
	it('stores the account and flips awaiting_account to preparing', async () => {
		await seed('acct-ok');

		expect(await saveCorretoraAccount(env, 'acct-ok', '123456')).toEqual({ ok: true });
		expect(await readLicense('acct-ok')).toEqual({ status: 'preparing', corretora_account: 123456 });
	});

	it('trims surrounding whitespace', async () => {
		await seed('acct-trim');

		expect(await saveCorretoraAccount(env, 'acct-trim', '  987654 ')).toEqual({ ok: true });
		expect((await readLicense('acct-trim'))?.corretora_account).toBe(987654);
	});

	it.each(['', 'abc', '12.5', '-5', '0', '007', '1e5', '1234567890123'])('rejects the non-integer/out-of-range value %j', async (value) => {
		const id = `acct-bad-${value.replace(/\W/g, '_')}`;
		await seed(id);

		expect(await saveCorretoraAccount(env, id, value)).toEqual({ ok: false, reason: 'invalid' });
		expect(await readLicense(id)).toEqual({ status: 'awaiting_account', corretora_account: null });
	});

	it('does not overwrite a second submit', async () => {
		await seed('acct-twice');
		await saveCorretoraAccount(env, 'acct-twice', '111111');

		expect(await saveCorretoraAccount(env, 'acct-twice', '222222')).toEqual({ ok: false, reason: 'already_set' });
		expect(await readLicense('acct-twice')).toEqual({ status: 'preparing', corretora_account: 111111 });
	});

	it('reports no_license when the purchase has no Licença row yet', async () => {
		await seed('acct-nolicense', { purchaseStatus: 'pending', noLicense: true });

		expect(await saveCorretoraAccount(env, 'acct-nolicense', '123456')).toEqual({ ok: false, reason: 'no_license' });
	});

	it.each(['refunded', 'chargeback', 'rejected', 'pending'])('refuses a %s purchase', async (purchaseStatus) => {
		const id = `acct-${purchaseStatus}`;
		await seed(id, { purchaseStatus });

		expect(await saveCorretoraAccount(env, id, '123456')).toEqual({ ok: false, reason: 'no_license' });
		expect(await readLicense(id)).toEqual({ status: 'awaiting_account', corretora_account: null });
	});
});
