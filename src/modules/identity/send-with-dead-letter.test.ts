import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/cloudflare';
import {
	countUnresolvedDeadLetters,
	listDeadLetters,
	resendDeadLetter,
	sendOrParkEmail,
} from './send-with-dead-letter';

vi.mock('@sentry/cloudflare', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

const message = { to: 'ops@example.com', replyTo: 'lead@example.com', subject: 'Nova encomenda', body: 'Quero um robô.' };

function resendOk() {
	vi.restoreAllMocks();
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"x"}', { status: 200 }));
}

function resendRejects(status = 422, body: unknown = { name: 'validation_error', message: 'Invalid `to` field' }) {
	vi.restoreAllMocks();
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

type Row = {
	id: string;
	kind: string;
	to_address: string;
	reply_to: string | null;
	subject: string;
	body: string | null;
	attempts: number;
	last_error: string;
	resolved_at: string | null;
};

async function rows(kind: string): Promise<Row[]> {
	const { results } = await env.DB.prepare('SELECT * FROM email_dead_letters WHERE kind = ? ORDER BY created_at, rowid')
		.bind(kind)
		.all<Row>();
	return results;
}

/** The resend lease is 10 s; tests that retry right after a park age the row first. */
async function ageAttempt(id: string): Promise<void> {
	await env.DB.prepare("UPDATE email_dead_letters SET last_attempt_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
		.bind(id)
		.run();
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('sendOrParkEmail', () => {
	it('a successful send inserts nothing', async () => {
		const fetchSpy = resendOk();

		const result = await sendOrParkEmail(env, message, { kind: 'dl-success' });

		expect(result).toEqual({ ok: true });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(await rows('dl-success')).toHaveLength(0);
	});

	it('sends the message as plain text with the reply-to as its own field', async () => {
		const fetchSpy = resendOk();

		await sendOrParkEmail(env, message, { kind: 'dl-shape' });

		const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
		expect(sent).toMatchObject({
			to: ['ops@example.com'],
			reply_to: 'lead@example.com',
			subject: 'Nova encomenda',
			text: 'Quero um robô.',
		});
		expect(sent.html).toBeUndefined();
	});

	it('parks a rejected send with recipient, subject, body and the Resend reason', async () => {
		resendRejects();

		const result = await sendOrParkEmail(env, message, { kind: 'dl-reject' });

		expect(result).toEqual({ ok: false, parked: true });
		const parked = await rows('dl-reject');
		expect(parked).toHaveLength(1);
		expect(parked[0]).toMatchObject({
			to_address: 'ops@example.com',
			reply_to: 'lead@example.com',
			subject: 'Nova encomenda',
			body: 'Quero um robô.',
			attempts: 1,
			last_error: 'validation_error: Invalid `to` field',
			resolved_at: null,
		});
	});

	it('parks a send that never reached Resend (network error) without throwing', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection reset'));

		const result = await sendOrParkEmail(env, message, { kind: 'dl-network' });

		expect(result).toEqual({ ok: false, parked: true });
		expect((await rows('dl-network'))[0].last_error).toContain('connection reset');
	});

	it('never stores the API key in the parked reason', async () => {
		resendRejects(401, { name: 'restricted_api_key', message: 'API key is invalid' });

		await sendOrParkEmail({ ...env, RESEND_API_KEY: 're_super_secret_key' }, message, { kind: 'dl-secret' });

		const parked = (await rows('dl-secret'))[0];
		expect(JSON.stringify(parked)).not.toContain('re_super_secret_key');
	});

	it('with storeBody: false parks only metadata, and the row cannot be resent', async () => {
		resendRejects();

		const result = await sendOrParkEmail(env, message, { kind: 'dl-nobody', storeBody: false });

		expect(result).toEqual({ ok: false, parked: true });
		const parked = (await rows('dl-nobody'))[0];
		expect(parked.body).toBeNull();
		expect(parked.subject).toBe('Nova encomenda');
		await ageAttempt(parked.id);
		const fetchSpy = resendOk();

		expect(await resendDeadLetter(env, parked.id)).toEqual({ ok: false, reason: 'no-body' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('a failing park (D1 down) is reported to Sentry and does not throw into the caller', async () => {
		resendRejects();
		const brokenDb = {
			prepare: () => {
				throw new Error('D1_ERROR: unavailable');
			},
		} as unknown as D1Database;

		const result = await sendOrParkEmail({ ...env, DB: brokenDb }, message, { kind: 'dl-d1-down' });

		expect(result).toEqual({ ok: false, parked: false });
		expect(Sentry.captureException).toHaveBeenCalledTimes(1);
	});
});

describe('resendDeadLetter', () => {
	async function park(kind: string): Promise<string> {
		const spy = resendRejects();
		await sendOrParkEmail(env, message, { kind });
		spy.mockRestore();
		const id = (await rows(kind))[0].id;
		await ageAttempt(id);
		return id;
	}

	it('a successful resend sends the stored message and resolves the row', async () => {
		const id = await park('dl-resend-ok');
		const fetchSpy = resendOk();

		const result = await resendDeadLetter(env, id);

		expect(result).toEqual({ ok: true });
		const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
		expect(sent).toMatchObject({
			to: ['ops@example.com'],
			reply_to: 'lead@example.com',
			subject: 'Nova encomenda',
			text: 'Quero um robô.',
		});
		const row = (await rows('dl-resend-ok'))[0];
		expect(row.resolved_at).not.toBeNull();
		expect(row.attempts).toBe(2);
	});

	it('a failed resend counts the attempt, updates the reason and leaves the row unresolved', async () => {
		const id = await park('dl-resend-fail');
		resendRejects(429, { name: 'rate_limit_exceeded', message: 'Too many requests' });

		const result = await resendDeadLetter(env, id);

		expect(result).toEqual({ ok: false, reason: 'send-failed', detail: 'rate_limit_exceeded: Too many requests' });
		const row = (await rows('dl-resend-fail'))[0];
		expect(row.resolved_at).toBeNull();
		expect(row.attempts).toBe(2);
		expect(row.last_error).toBe('rate_limit_exceeded: Too many requests');
	});

	it('a second resend of a resolved row sends nothing', async () => {
		const id = await park('dl-resend-twice');
		const fetchSpy = resendOk();

		await resendDeadLetter(env, id);
		const second = await resendDeadLetter(env, id);

		expect(second).toEqual({ ok: false, reason: 'already-resolved' });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('two clicks racing send once', async () => {
		const id = await park('dl-resend-race');
		const fetchSpy = resendOk();

		const results = await Promise.all([resendDeadLetter(env, id), resendDeadLetter(env, id)]);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok)).toHaveLength(1);
		expect((await rows('dl-resend-race'))[0].attempts).toBe(2);
	});

	it('a resend straight after the park is held off briefly', async () => {
		resendRejects();
		await sendOrParkEmail(env, message, { kind: 'dl-resend-busy' });
		const id = (await rows('dl-resend-busy'))[0].id;
		const fetchSpy = resendOk();

		expect(await resendDeadLetter(env, id)).toEqual({ ok: false, reason: 'busy' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('an unknown id is not found', async () => {
		expect(await resendDeadLetter(env, 'nope')).toEqual({ ok: false, reason: 'not-found' });
	});

	it('a network error during resend is a failed attempt, not a throw', async () => {
		const id = await park('dl-resend-net');
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

		const result = await resendDeadLetter(env, id);

		expect(result.ok).toBe(false);
		expect((await rows('dl-resend-net'))[0].last_error).toContain('timeout');
	});
});

describe('listing', () => {
	it('lists unresolved rows before resolved ones and counts only the unresolved', async () => {
		await env.DB.prepare('DELETE FROM email_dead_letters').run();
		resendRejects();
		await sendOrParkEmail(env, { ...message, subject: 'first' }, { kind: 'dl-list' });
		await sendOrParkEmail(env, { ...message, subject: 'second' }, { kind: 'dl-list' });
		const [first] = await rows('dl-list');
		await ageAttempt(first.id);
		resendOk();
		await resendDeadLetter(env, first.id);

		const { unresolved, resolved } = await listDeadLetters(env);

		expect(unresolved.map((r) => r.subject)).toEqual(['second']);
		expect(resolved.map((r) => r.subject)).toEqual(['first']);
		expect(unresolved[0]).toMatchObject({
			kind: 'dl-list',
			toAddress: 'ops@example.com',
			attempts: 1,
			lastError: expect.any(String),
		});
		expect(unresolved[0]).not.toHaveProperty('body');
		expect(await countUnresolvedDeadLetters(env)).toBe(1);
	});
});
