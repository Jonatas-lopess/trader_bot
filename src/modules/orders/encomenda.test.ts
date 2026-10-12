import { env } from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWhatsappHref, normalizeEncomendaInput, submitEncomenda, HONEYPOT_FIELD } from './encomenda';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

const validFields = {
	name: 'Maria  Souza',
	email: 'Maria@Example.com',
	phone: '',
	strategy: 'Compra no rompimento da máxima das 10h com stop de 100 pontos.',
	market: 'Mini índice',
	corretora: 'XP',
	consent: 'on',
};

describe('normalizeEncomendaInput', () => {
	it('normalizes a valid submission', () => {
		const result = normalizeEncomendaInput(validFields);
		expect(result).toEqual({
			ok: true,
			input: {
				name: 'Maria Souza',
				email: 'maria@example.com',
				phone: null,
				strategy: validFields.strategy,
				market: 'Mini índice',
				corretora: 'XP',
			},
		});
	});

	it('accepts a phone alone and normalizes it to digits', () => {
		const result = normalizeEncomendaInput({ ...validFields, email: '', phone: '+55 (11) 91234-5678' });
		expect(result).toMatchObject({ ok: true, input: { email: null, phone: '11912345678' } });
	});

	it('requires at least one contact', () => {
		const result = normalizeEncomendaInput({ ...validFields, email: '  ', phone: '' });
		expect(result).toEqual({ ok: false, fieldErrors: { contact: 'contact_required' } });
	});

	it('reports every invalid field at once', () => {
		const result = normalizeEncomendaInput({
			name: '',
			email: 'not-an-email',
			phone: '123',
			strategy: 'curto',
			market: 'x'.repeat(101),
			corretora: 'y'.repeat(101),
		});
		expect(result).toEqual({
			ok: false,
			fieldErrors: {
				name: 'name_invalid',
				email: 'email_invalid',
				phone: 'phone_invalid',
				strategy: 'strategy_invalid',
				market: 'market_invalid',
				corretora: 'corretora_invalid',
				consent: 'consent_required',
			},
		});
	});

	it('needs the consent', () => {
		const result = normalizeEncomendaInput({ ...validFields, consent: undefined });
		expect(result).toEqual({ ok: false, fieldErrors: { consent: 'consent_required' } });
	});

	it('limits the strategy length', () => {
		expect(normalizeEncomendaInput({ ...validFields, strategy: 'a'.repeat(2000) }).ok).toBe(true);
		expect(normalizeEncomendaInput({ ...validFields, strategy: 'a'.repeat(2001) })).toMatchObject({
			ok: false,
			fieldErrors: { strategy: 'strategy_invalid' },
		});
	});

	it('keeps line breaks in the strategy but strips control characters', () => {
		const result = normalizeEncomendaInput({ ...validFields, strategy: 'linha um\r\nlinha dois\u0000\u0007 fim.' });
		expect(result).toMatchObject({ ok: true, input: { strategy: 'linha um\nlinha dois fim.' } });
	});

	it('rejects an e-mail with header-injection characters', () => {
		for (const email of ['a@example.com\r\nBcc: evil@example.com', 'a@example.com,b@example.com', 'a<b>@example.com']) {
			expect(normalizeEncomendaInput({ ...validFields, email })).toMatchObject({
				ok: false,
				fieldErrors: { email: 'email_invalid' },
			});
		}
	});

	it('collapses a name or market with line breaks into one line', () => {
		const result = normalizeEncomendaInput({ ...validFields, name: 'Maria\r\nBcc: evil@example.com', market: 'a\nb' });
		expect(result).toMatchObject({ ok: true, input: { name: 'Maria Bcc: evil@example.com', market: 'a b' } });
	});

	it('treats non-string values as invalid, never throws', () => {
		expect(normalizeEncomendaInput(null).ok).toBe(false);
		expect(normalizeEncomendaInput({ ...validFields, name: { toString: 1 }, strategy: 42 }).ok).toBe(false);
	});
});

describe('buildWhatsappHref', () => {
	it('builds a wa.me link with the url-encoded text', () => {
		const href = buildWhatsappHref('+55 11 91234-5678', 'Olá! Mercado: mini índice & dólar');
		expect(href).toBe(`https://wa.me/5511912345678?text=${encodeURIComponent('Olá! Mercado: mini índice & dólar')}`);
	});

	it('truncates long text so the link stays short, without splitting a character', () => {
		const href = buildWhatsappHref('5511912345678', '😀ç'.repeat(2000));
		expect(href).not.toBeNull();
		expect(href!.length).toBeLessThanOrEqual(1700);
		expect(() => decodeURIComponent(href!.split('?text=')[1])).not.toThrow();
	});

	it('returns null without a usable number', () => {
		expect(buildWhatsappHref('', 'x')).toBeNull();
		expect(buildWhatsappHref('abc', 'x')).toBeNull();
	});
});

type LeadRow = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	strategy: string;
	market: string;
	corretora: string;
	notified_at: string | null;
};

async function leads(): Promise<LeadRow[]> {
	const { results } = await env.DB.prepare('SELECT * FROM custom_orders ORDER BY created_at, rowid').all<LeadRow>();
	return results;
}

async function deadLetters() {
	const { results } = await env.DB.prepare("SELECT * FROM email_dead_letters WHERE kind = 'encomenda'").all<{
		to_address: string;
		reply_to: string | null;
		subject: string;
		body: string | null;
		last_error: string;
	}>();
	return results;
}

function submitEnv(overrides: Record<string, unknown> = {}) {
	return {
		DB: env.DB,
		RESEND_API_KEY: 'test-key',
		ORDER_NOTIFY_EMAIL: 'ops@example.com',
		WHATSAPP_NUMBER: '5511912345678',
		ENCOMENDA_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
		...overrides,
	} as unknown as Parameters<typeof submitEncomenda>[0];
}

function resend(status = 200, body: unknown = { id: 'x' }) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

type ResendPayload = { to: string[]; reply_to?: string; subject: string; text: string; html?: string };
const sentPayload = (spy: ReturnType<typeof resend>): ResendPayload =>
	JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);

beforeEach(async () => {
	await env.DB.prepare('DELETE FROM custom_orders').run();
	await env.DB.prepare("DELETE FROM email_dead_letters WHERE kind = 'encomenda'").run();
	vi.mocked(Sentry.captureMessage).mockClear();
	vi.mocked(Sentry.captureException).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('submitEncomenda', () => {
	it('stores the lead, e-mails the operator with reply-to, and returns the WhatsApp link', async () => {
		const fetchSpy = resend();
		const result = await submitEncomenda(submitEnv(), { fields: validFields, ip: '203.0.113.9' });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.whatsappHref).toMatch(/^https:\/\/wa\.me\/5511912345678\?text=/);
		expect(decodeURIComponent(result.whatsappHref!.split('?text=')[1])).toContain('Maria Souza');

		const [lead] = await leads();
		expect(lead).toMatchObject({
			name: 'Maria Souza',
			email: 'maria@example.com',
			phone: null,
			market: 'Mini índice',
			corretora: 'XP',
		});
		expect(lead.notified_at).not.toBeNull();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const payload = sentPayload(fetchSpy);
		expect(payload).toMatchObject({ to: ['ops@example.com'], reply_to: 'maria@example.com' });
		expect(payload.subject).toBe(`Nova Encomenda de Robô ${lead.id.slice(0, 8)}`);
		expect(payload.text).toContain(validFields.strategy);
		expect(payload.html).toBeUndefined();
		expect(await deadLetters()).toEqual([]);
	});

	it('sends no reply-to when only a phone was given, and says so in the body', async () => {
		const fetchSpy = resend();
		await submitEncomenda(submitEnv(), { fields: { ...validFields, email: '', phone: '11912345678' }, ip: '203.0.113.9' });

		const payload = sentPayload(fetchSpy);
		expect(payload.reply_to).toBeUndefined();
		expect(payload.text).toContain('11912345678');
	});

	it('still succeeds when Resend refuses: the lead is stored and the e-mail sits in the dead letter', async () => {
		resend(422, { name: 'validation_error', message: 'Invalid `to` field' });
		const result = await submitEncomenda(submitEnv(), { fields: validFields, ip: '203.0.113.9' });

		expect(result.ok).toBe(true);
		const [lead] = await leads();
		expect(lead.notified_at).toBeNull();
		const [parked] = await deadLetters();
		expect(parked).toMatchObject({ to_address: 'ops@example.com', reply_to: 'maria@example.com' });
		expect(parked.body).toContain(validFields.strategy);
		expect(parked.last_error).toContain('validation_error');
		expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('encomenda'), expect.anything());
	});

	it('still succeeds when the fetch itself throws', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
		const result = await submitEncomenda(submitEnv(), { fields: validFields, ip: '203.0.113.9' });

		expect(result.ok).toBe(true);
		expect(await leads()).toHaveLength(1);
		expect(await deadLetters()).toHaveLength(1);
	});

	it('stores the lead and logs when ORDER_NOTIFY_EMAIL is unset, sending nothing', async () => {
		const fetchSpy = resend();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = await submitEncomenda(submitEnv({ ORDER_NOTIFY_EMAIL: '' }), { fields: validFields, ip: '203.0.113.9' });

		expect(result.ok).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
		const [lead] = await leads();
		expect(lead.notified_at).toBeNull();
		expect(warn).toHaveBeenCalled();
		expect(JSON.stringify(warn.mock.calls)).not.toContain('maria@example.com');
		expect(await deadLetters()).toEqual([]);
	});

	it('drops a honeypot hit without a row or an e-mail, answering like a success', async () => {
		const fetchSpy = resend();
		const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
		const result = await submitEncomenda(submitEnv({ ENCOMENDA_RATE_LIMITER: limiter }), {
			fields: { ...validFields, [HONEYPOT_FIELD]: 'http://spam.example' },
			ip: '203.0.113.9',
		});

		expect(result.ok).toBe(true);
		expect(await leads()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(limiter.limit).not.toHaveBeenCalled();
	});

	it('drops an over-limit submission: nothing stored, nothing sent', async () => {
		const fetchSpy = resend();
		const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
		const result = await submitEncomenda(submitEnv({ ENCOMENDA_RATE_LIMITER: limiter }), {
			fields: validFields,
			ip: '203.0.113.9',
		});

		expect(result).toEqual({ ok: false, reason: 'rate-limited' });
		expect(limiter.limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.9' });
		expect(await leads()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns field errors for an invalid submission without spending a rate-limit hit', async () => {
		const fetchSpy = resend();
		const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
		const result = await submitEncomenda(submitEnv({ ENCOMENDA_RATE_LIMITER: limiter }), {
			fields: { ...validFields, name: '' },
			ip: '203.0.113.9',
		});

		expect(result).toEqual({ ok: false, reason: 'invalid', fieldErrors: { name: 'name_invalid' } });
		expect(limiter.limit).not.toHaveBeenCalled();
		expect(await leads()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('keeps header-injection attempts out of the subject, recipient and reply-to', async () => {
		const fetchSpy = resend();
		const attack = 'Mallory\r\nBcc: evil@example.com\r\nSubject: pwned';
		const result = await submitEncomenda(submitEnv(), {
			fields: { ...validFields, name: attack, market: attack, corretora: attack, strategy: `${attack} ${validFields.strategy}` },
			ip: '203.0.113.9',
		});

		expect(result.ok).toBe(true);
		const payload = sentPayload(fetchSpy);
		expect(payload.to).toEqual(['ops@example.com']);
		expect(payload.reply_to).toBe('maria@example.com');
		expect(payload.subject).toMatch(/^Nova Encomenda de Robô [0-9a-f]{8}$/);
		expect(payload.subject).not.toMatch(/[\r\n]/);
		// In the plain-text body the attack is inert text: no CR, and no header-looking line of its own.
		expect(payload.text).not.toContain('\r');
		expect(payload.text.split('\n')).not.toContain('Bcc: evil@example.com');
	});

	it('reports a failed insert instead of pretending the lead was stored', async () => {
		resend();
		const brokenDb = {
			prepare: () => {
				throw new Error('D1 down');
			},
		};
		const result = await submitEncomenda(submitEnv({ DB: brokenDb }), { fields: validFields, ip: '203.0.113.9' });

		expect(result).toEqual({ ok: false, reason: 'storage-failed' });
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	it('omits the WhatsApp link when the number is set but unusable, and uses the placeholder when unset', async () => {
		resend();
		const bad = await submitEncomenda(submitEnv({ WHATSAPP_NUMBER: '+' }), { fields: validFields, ip: '203.0.113.9' });
		expect(bad).toEqual({ ok: true, whatsappHref: null });
		const unset = await submitEncomenda(submitEnv({ WHATSAPP_NUMBER: '' }), { fields: validFields, ip: '203.0.113.9' });
		expect(unset).toMatchObject({ ok: true, whatsappHref: expect.stringContaining('https://wa.me/') });
	});
});
