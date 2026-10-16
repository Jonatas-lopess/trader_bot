import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jpegBytes, pngBytes, svgBytes, upload } from '../../../test/gallery-fixtures';
import { POST as postImages } from '../../pages/admin/robos/[slug]/galeria/imagens';
import { POST as postRemove } from '../../pages/admin/robos/[slug]/galeria/[id]/remover';
import { POST as postVideo } from '../../pages/admin/robos/[slug]/galeria/video';
import { POST as postCaption } from '../../pages/admin/robos/[slug]/galeria/[id]/legenda';
import { POST as postMove } from '../../pages/admin/robos/[slug]/galeria/[id]/mover';
import { GET as getMedia } from '../../pages/media/[id]';
import { createSession, SESSION_COOKIE_NAME } from '../identity/session';
import { addImages, addVideo, listGallery, MAX_UPLOAD_REQUEST_BYTES } from './gallery';
import { clearCatalog, seedRobot } from './test-helpers';

// Seam 2 of .scratch/robot-gallery/spec.md: the admin gallery routes and the media route, called
// as Astro calls them, against the real D1 and R2 bindings. The routes read the shared `env`, so
// the admin allowlist is set on it for the file and restored after.
const origin = 'https://example.com';
const adminEnv = env as { ADMIN_EMAILS?: string };
const savedAdmins = adminEnv.ADMIN_EMAILS;

let adminCookie = '';
let clienteCookie = '';

async function cookieFor(id: string, email: string): Promise<string> {
	await env.DB.prepare('INSERT INTO customers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(id, email).run();
	const { cookieValue } = await createSession(env, id);
	return `${SESSION_COOKIE_NAME}=${cookieValue}`;
}

async function storedKeys(): Promise<string[]> {
	return (await env.ROBOT_MEDIA.list()).objects.map((o) => o.key);
}

type Call = { request: Request; params: Record<string, string>; url: URL };
const context = (request: Request, params: Record<string, string>) =>
	({ request, params, url: new URL(request.url) }) as Call as never;

function multipart(files: File[], headers: Record<string, string>): Request {
	const form = new FormData();
	for (const file of files) form.append('images', file);
	return new Request(`${origin}/admin/robos/robo-a/galeria/imagens`, { method: 'POST', body: form, headers });
}

/** The POST as a browser sends it: multipart, with Content-Length, from our own origin. */
async function uploadRequest(files: File[], headers: Record<string, string> = { Cookie: adminCookie, Origin: origin }): Promise<Request> {
	const draft = multipart(files, headers);
	const body = await draft.arrayBuffer();
	return new Request(draft.url, {
		method: 'POST',
		body,
		headers: { ...headers, 'Content-Type': draft.headers.get('Content-Type')!, 'Content-Length': String(body.byteLength) },
	});
}

const removeRequest = (id: string, headers: Record<string, string> = { Cookie: adminCookie, Origin: origin }) =>
	new Request(`${origin}/admin/robos/robo-a/galeria/${id}/remover`, { method: 'POST', headers });

const videoRequest = (url: string, headers: Record<string, string> = { Cookie: adminCookie, Origin: origin }) =>
	new Request(`${origin}/admin/robos/robo-a/galeria/video`, {
		method: 'POST',
		body: new URLSearchParams({ url }),
		headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
	});

const itemFormRequest = (id: string, action: 'legenda' | 'mover', fields: Record<string, string>, headers: Record<string, string> = { Cookie: adminCookie, Origin: origin }) =>
	new Request(`${origin}/admin/robos/robo-a/galeria/${id}/${action}`, {
		method: 'POST',
		body: new URLSearchParams(fields),
		headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
	});

async function seededVideo(youtubeId = 'dQw4w9WgXcQ'): Promise<string> {
	await addVideo(env, 'robo-a', `https://youtu.be/${youtubeId}`);
	const items = await listGallery(env, 'robo-a');
	return items[items.length - 1].id;
}

const mediaRequest = (id: string, headers: Record<string, string> = {}) => new Request(`${origin}/media/${id}`, { headers });

beforeEach(async () => {
	adminEnv.ADMIN_EMAILS = 'boss@example.com';
	adminCookie = await cookieFor('cust-gallery-admin', 'boss@example.com');
	clienteCookie = await cookieFor('cust-gallery-cliente', 'cliente@example.com');
	await clearCatalog();
	await env.DB.prepare('DELETE FROM robot_gallery_items').run();
	const keys = await storedKeys();
	if (keys.length > 0) await env.ROBOT_MEDIA.delete(keys);
	await seedRobot({ slug: 'robo-a', status: 'draft' });
});

afterEach(() => {
	adminEnv.ADMIN_EMAILS = savedAdmins;
});

describe('POST /admin/robos/<slug>/galeria/imagens', () => {
	it('stores the uploaded images and redirects to the gallery with a flash', async () => {
		const response = await postImages(context(await uploadRequest([upload(pngBytes(8, 8)), upload(jpegBytes(9, 9))]), { slug: 'robo-a' }));

		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?ok=gallery-added#galeria`);
		expect(await listGallery(env, 'robo-a')).toHaveLength(2);
	});

	it('redirects with the error code when a file is refused, storing nothing', async () => {
		const response = await postImages(context(await uploadRequest([upload(svgBytes(), 'x.png', 'image/png')]), { slug: 'robo-a' }));

		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?error=unsupported-type#galeria`);
		expect(await storedKeys()).toEqual([]);
	});

	it('answers an empty file input with no-files', async () => {
		const response = await postImages(context(await uploadRequest([new File([], '', { type: 'application/octet-stream' })]), { slug: 'robo-a' }));

		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?error=no-files#galeria`);
	});

	it('is an empty 404 for an unknown Robô', async () => {
		const response = await postImages(context(await uploadRequest([upload(pngBytes(1, 1))]), { slug: 'no-such-robot' }));

		expect(response.status).toBe(404);
		expect(await response.text()).toBe('');
	});

	/** A multipart-looking body of `chunks` x 64 KiB that records how far it was read. */
	function trackedBody(chunks: number) {
		const state = { pulled: 0, cancelled: false };
		const chunk = new Uint8Array(64 * 1024);
		// highWaterMark 0: the stream pulls only when someone reads it.
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (state.pulled === chunks) return controller.close();
					state.pulled++;
					controller.enqueue(chunk);
				},
				cancel() {
					state.cancelled = true;
				},
			},
			{ highWaterMark: 0 }
		);
		return { stream, state };
	}

	const oversizeRequest = (body: ReadableStream<Uint8Array>) =>
		new Request(`${origin}/admin/robos/robo-a/galeria/imagens`, {
			method: 'POST',
			body,
			headers: {
				Cookie: adminCookie,
				Origin: origin,
				'Content-Type': 'multipart/form-data; boundary=x',
				'Content-Length': String(MAX_UPLOAD_REQUEST_BYTES + 1),
			},
		});

	it('refuses a declared Content-Length over the ceiling with a readable page, never parsing or storing the body', async () => {
		// Not valid multipart: had the route parsed it, the answer would be a redirect, not a 413.
		const { stream, state } = trackedBody(4);

		const response = await postImages(context(oversizeRequest(stream), { slug: 'robo-a' }));

		expect(response.status).toBe(413);
		expect(response.headers.get('Content-Type')).toContain('text/html');
		const page = await response.text();
		expect(page).toContain('/admin/robos/robo-a#galeria');
		expect(page).toContain('5 MB');
		// Drained to the end so a browser still sending can read the answer.
		expect(state.pulled).toBe(4);
		expect(await listGallery(env, 'robo-a')).toEqual([]);
		expect(await storedKeys()).toEqual([]);
	});

	it('stops draining an oversize body past a bound', async () => {
		const chunksPastBound = Math.ceil((2 * MAX_UPLOAD_REQUEST_BYTES) / (64 * 1024)) + 50;
		const { stream, state } = trackedBody(chunksPastBound);

		const response = await postImages(context(oversizeRequest(stream), { slug: 'robo-a' }));

		expect(response.status).toBe(413);
		expect(state.cancelled).toBe(true);
		expect(state.pulled).toBeLessThan(chunksPastBound);
	}, 60_000);
});

describe('the gate on every gallery action', () => {
	const actions = {
		upload: async (headers: Record<string, string>) =>
			postImages(context(await uploadRequest([upload(pngBytes(1, 1))], headers), { slug: 'robo-a' })),
		remove: async (headers: Record<string, string>) => {
			await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);
			const [item] = await listGallery(env, 'robo-a');
			return postRemove(context(removeRequest(item.id, headers), { slug: 'robo-a', id: item.id }));
		},
		video: async (headers: Record<string, string>) =>
			postVideo(context(videoRequest('https://youtu.be/dQw4w9WgXcQ', headers), { slug: 'robo-a' })),
		caption: async (headers: Record<string, string>) => {
			const id = await seededVideo();
			return postCaption(context(itemFormRequest(id, 'legenda', { caption: 'hijack' }, headers), { slug: 'robo-a', id }));
		},
		move: async (headers: Record<string, string>) => {
			await seededVideo('aaaaaaaaaaa');
			const id = await seededVideo('bbbbbbbbbbb');
			return postMove(context(itemFormRequest(id, 'mover', { direction: 'up' }, headers), { slug: 'robo-a', id }));
		},
	};

	it.each(['caption', 'move'] as const)('%s: a refused caller changes neither captions nor order', async (action) => {
		for (const headers of [{ Origin: origin }, { Cookie: adminCookie, Origin: 'https://evil.example' }] as Record<string, string>[]) {
			await actions[action](headers);
		}
		const items = await listGallery(env, 'robo-a');
		expect(items.every((i) => i.caption === null)).toBe(true);
		expect(items.map((i) => (i.kind === 'video' ? i.youtubeId : ''))).toEqual(
			action === 'move' ? ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa', 'bbbbbbbbbbb'] : ['dQw4w9WgXcQ', 'dQw4w9WgXcQ']
		);
	});

	it.each(Object.keys(actions) as (keyof typeof actions)[])('%s: anonymous and non-admin get an empty 404 and change nothing', async (action) => {
		const callers: Record<string, string>[] = [{ Origin: origin }, { Cookie: clienteCookie, Origin: origin }];
		for (const headers of callers) {
			const response = await actions[action](headers);
			expect(response.status).toBe(404);
			expect(await response.text()).toBe('');
		}
		// Some actions seed their own items per call (two calls here); nothing else may appear or go.
		const seededRows = { upload: 0, remove: 2, video: 0, caption: 2, move: 4 }[action];
		expect(await listGallery(env, 'robo-a')).toHaveLength(seededRows);
		expect(await storedKeys()).toHaveLength(action === 'remove' ? 2 : 0);
	});

	it.each(Object.keys(actions) as (keyof typeof actions)[])('%s: a cross-origin admin POST gets 403', async (action) => {
		const response = await actions[action]({ Cookie: adminCookie, Origin: 'https://evil.example' });

		expect(response.status).toBe(403);
	});

	it('a non-admin is a 404 even when the request is also too large', async () => {
		const request = new Request(`${origin}/admin/robos/robo-a/galeria/imagens`, {
			method: 'POST',
			body: 'x',
			headers: { Origin: origin, 'Content-Length': String(MAX_UPLOAD_REQUEST_BYTES + 1) },
		});

		expect((await postImages(context(request, { slug: 'robo-a' }))).status).toBe(404);
	});
});

describe('POST /admin/robos/<slug>/galeria/<id>/remover', () => {
	it('removes the item and its file and redirects with a flash', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);
		const [item] = await listGallery(env, 'robo-a');

		const response = await postRemove(context(removeRequest(item.id), { slug: 'robo-a', id: item.id }));

		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?ok=gallery-removed#galeria`);
		expect(await listGallery(env, 'robo-a')).toEqual([]);
		expect(await storedKeys()).toEqual([]);
	});

	it('redirects with not-found for an id that is not this Robô item', async () => {
		const response = await postRemove(context(removeRequest('no-such-id'), { slug: 'robo-a', id: 'no-such-id' }));

		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?error=not-found#galeria`);
	});
});

describe('POST /admin/robos/<slug>/galeria/video', () => {
	it('adds the video and redirects with a flash', async () => {
		const response = await postVideo(context(videoRequest('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), { slug: 'robo-a' }));

		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?ok=gallery-video-added#galeria`);
		expect(await listGallery(env, 'robo-a')).toEqual([expect.objectContaining({ kind: 'video', youtubeId: 'dQw4w9WgXcQ' })]);
	});

	it('redirects with invalid-youtube-url for a bad link, never echoing it', async () => {
		const response = await postVideo(context(videoRequest('https://evil.example/<script>'), { slug: 'robo-a' }));

		const location = response.headers.get('Location') ?? '';
		expect(location).toBe(`${origin}/admin/robos/robo-a?error=invalid-youtube-url#galeria`);
		expect(await listGallery(env, 'robo-a')).toEqual([]);
	});

	it('is an empty 404 for an unknown Robô', async () => {
		const response = await postVideo(context(videoRequest('https://youtu.be/dQw4w9WgXcQ'), { slug: 'no-such-robot' }));

		expect(response.status).toBe(404);
	});
});

describe('POST /admin/robos/<slug>/galeria/<id>/legenda and /mover', () => {
	it('saves a caption and redirects with a flash', async () => {
		const id = await seededVideo();

		const response = await postCaption(context(itemFormRequest(id, 'legenda', { caption: 'Demonstração' }), { slug: 'robo-a', id }));

		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?ok=gallery-caption-saved#galeria`);
		expect((await listGallery(env, 'robo-a'))[0].caption).toBe('Demonstração');
	});

	it('refuses a caption over the limit with caption-too-long', async () => {
		const id = await seededVideo();

		const response = await postCaption(context(itemFormRequest(id, 'legenda', { caption: 'x'.repeat(141) }), { slug: 'robo-a', id }));

		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?error=caption-too-long#galeria`);
	});

	it('moves an item and redirects with a flash; an unknown direction changes nothing', async () => {
		await seededVideo('aaaaaaaaaaa');
		const id = await seededVideo('bbbbbbbbbbb');

		const bad = await postMove(context(itemFormRequest(id, 'mover', { direction: 'sideways' }), { slug: 'robo-a', id }));
		expect(bad.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a#galeria`);
		expect((await listGallery(env, 'robo-a')).map((i) => (i.kind === 'video' ? i.youtubeId : ''))).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);

		const response = await postMove(context(itemFormRequest(id, 'mover', { direction: 'up' }), { slug: 'robo-a', id }));
		expect(response.headers.get('Location')).toBe(`${origin}/admin/robos/robo-a?ok=gallery-moved#galeria`);
		expect((await listGallery(env, 'robo-a')).map((i) => (i.kind === 'video' ? i.youtubeId : ''))).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
	});
});

describe('GET /media/<id>', () => {
	async function imageOn(slug: string, status: 'draft' | 'available' | 'coming-soon' | 'archived'): Promise<string> {
		await seedRobot({ slug, status, offers: { one_time: 99700 } });
		await addImages(env, slug, [upload(jpegBytes(4, 3, 50))]);
		const [item] = await listGallery(env, slug);
		return item.id;
	}

	it('serves a published Robô image with the stored type, nosniff and an immutable cache lifetime', async () => {
		const id = await imageOn('robo-pub', 'available');

		const response = await getMedia(context(mediaRequest(id), { id }));

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes(4, 3, 50));
	});

	it('is a 404 for a draft or archived Robô to an anonymous caller and to a Cliente', async () => {
		for (const [slug, status] of [
			['robo-draft', 'draft'],
			['robo-archived', 'archived'],
		] as const) {
			const id = await imageOn(slug, status);
			expect((await getMedia(context(mediaRequest(id), { id }))).status).toBe(404);
			expect((await getMedia(context(mediaRequest(id, { Cookie: clienteCookie }), { id }))).status).toBe(404);
		}
	});

	it('serves a draft to an admin, never cached', async () => {
		const id = await imageOn('robo-draft', 'draft');

		const response = await getMedia(context(mediaRequest(id, { Cookie: adminCookie }), { id }));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		await response.body?.cancel();
	});

	it('is a 404 for an unknown id and for a row whose object is missing', async () => {
		const id = await imageOn('robo-pub', 'available');
		await env.ROBOT_MEDIA.delete(`gallery/${id}`);

		expect((await getMedia(context(mediaRequest(id), { id }))).status).toBe(404);
		expect((await getMedia(context(mediaRequest('nope'), { id: 'nope' }))).status).toBe(404);
	});
});
