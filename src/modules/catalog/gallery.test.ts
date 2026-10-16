import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	avifBytes,
	htmlBytes,
	jpegBytes,
	pngBytes,
	svgBytes,
	upload,
	webpBytes,
	webpLosslessBytes,
	webpLossyBytes,
} from '../../../test/gallery-fixtures';
import {
	addImages,
	addVideo,
	GALLERY_LIMITS,
	listGallery,
	moveItem,
	openMedia,
	parseYoutubeUrl,
	removeItem,
	reorderGallery,
	setCaption,
	youtubeEmbedUrl,
	youtubeThumbnailUrl,
} from './gallery';
import { clearCatalog, seedRobot } from './test-helpers';

async function storedKeys(): Promise<string[]> {
	return (await env.ROBOT_MEDIA.list()).objects.map((o) => o.key);
}

async function clearGallery(): Promise<void> {
	await env.DB.prepare('DELETE FROM robot_gallery_items').run();
	const keys = await storedKeys();
	if (keys.length > 0) await env.ROBOT_MEDIA.delete(keys);
}

async function fillGallery(slug: string, count: number): Promise<void> {
	for (let i = 0; i < count; i += GALLERY_LIMITS.maxFilesPerRequest) {
		const size = Math.min(GALLERY_LIMITS.maxFilesPerRequest, count - i);
		const batch = Array.from({ length: size }, () => upload(pngBytes(10, 10)));
		expect(await addImages(env, slug, batch)).toMatchObject({ ok: true });
	}
}

// Filling a gallery to the cap is a dozen R2 puts and D1 writes; on a loaded machine that
// outruns the suite's 15 s default.
const FILL_TIMEOUT = 120_000;

const readBody = async (body: ReadableStream) => new Uint8Array(await new Response(body).arrayBuffer());

beforeEach(async () => {
	await clearCatalog();
	await clearGallery();
	await seedRobot({ slug: 'robo-a', status: 'draft' });
});

describe('addImages', () => {
	it('stores a PNG and lists it with its sniffed type and pixel size', async () => {
		const result = await addImages(env, 'robo-a', [upload(pngBytes(640, 480))]);

		expect(result).toEqual({ ok: true, added: 1 });
		const items = await listGallery(env, 'robo-a');
		expect(items).toEqual([
			expect.objectContaining({ kind: 'image', contentType: 'image/png', width: 640, height: 480, caption: null }),
		]);
	});

	it.each([
		['JPEG', jpegBytes(1920, 1080), 'image/jpeg', 1920, 1080],
		['WebP (extended)', webpBytes(800, 600), 'image/webp', 800, 600],
		['WebP (lossy)', webpLossyBytes(320, 200), 'image/webp', 320, 200],
		['WebP (lossless)', webpLosslessBytes(64, 32), 'image/webp', 64, 32],
		['AVIF', avifBytes(1200, 900), 'image/avif', 1200, 900],
	])('stores a %s with the type and size read from its header', async (_label, bytes, contentType, width, height) => {
		// The filename and the browser's claim say PNG; only the bytes count.
		expect(await addImages(env, 'robo-a', [upload(bytes, 'foto.png', 'image/png')])).toEqual({ ok: true, added: 1 });

		expect(await listGallery(env, 'robo-a')).toEqual([
			expect.objectContaining({ contentType, width, height, byteSize: bytes.byteLength }),
		]);
	});

	it('stores several files in one go, in the order given, after the existing items', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);

		const result = await addImages(env, 'robo-a', [upload(jpegBytes(2, 2)), upload(webpBytes(3, 3))]);

		expect(result).toEqual({ ok: true, added: 2 });
		const items = await listGallery(env, 'robo-a');
		expect(items.map((i) => (i.kind === 'image' ? i.width : 0))).toEqual([1, 2, 3]);
		expect(await storedKeys()).toHaveLength(3);
	});

	it('keeps the stored bytes byte for byte, under a key built from the item id, not the slug', async () => {
		const bytes = pngBytes(5, 5, 300);
		await addImages(env, 'robo-a', [upload(bytes)]);
		const [item] = await listGallery(env, 'robo-a');

		const keys = await storedKeys();
		expect(keys).toEqual([`gallery/${item.id}`]);
		expect(keys[0]).not.toContain('robo-a');
		const object = await env.ROBOT_MEDIA.get(keys[0]);
		expect(await readBody(object!.body)).toEqual(bytes);
	});

	it.each([
		['an HTML page claiming to be a PNG', htmlBytes(), 'unsupported-type'],
		['an SVG', svgBytes(), 'unsupported-type'],
		['a non-image', new TextEncoder().encode('MZ this is not an image at all'), 'unsupported-type'],
		['an empty file', new Uint8Array(), 'unsupported-type'],
		['a PNG cut short before its header ends', pngBytes(10, 10).slice(0, 16), 'unreadable-image'],
		['a JPEG with no frame header', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'unreadable-image'],
		['a WebP with an unknown chunk', new TextEncoder().encode('RIFF\0\0\0\0WEBPXXXX0000000000000000'), 'unreadable-image'],
		['an image of zero pixels', pngBytes(0, 10), 'unreadable-image'],
	])('refuses %s and stores nothing', async (_label, bytes, error) => {
		const result = await addImages(env, 'robo-a', [upload(bytes as Uint8Array<ArrayBuffer>, 'photo.png', 'image/png')]);

		expect(result).toEqual({ ok: false, error, added: 0 });
		expect(await listGallery(env, 'robo-a')).toEqual([]);
		expect(await storedKeys()).toEqual([]);
	});

	it('refuses a file over the size limit, and accepts one exactly at it', async () => {
		const over = await addImages(env, 'robo-a', [upload(pngBytes(10, 10, GALLERY_LIMITS.maxImageBytes + 1))]);
		expect(over).toEqual({ ok: false, error: 'file-too-large', added: 0 });
		expect(await storedKeys()).toEqual([]);

		const at = await addImages(env, 'robo-a', [upload(pngBytes(10, 10, GALLERY_LIMITS.maxImageBytes))]);
		expect(at).toEqual({ ok: true, added: 1 });
	});

	it('refuses the whole request when one file of several is bad', async () => {
		const result = await addImages(env, 'robo-a', [upload(pngBytes(10, 10)), upload(svgBytes())]);

		expect(result).toEqual({ ok: false, error: 'unsupported-type', added: 0 });
		expect(await listGallery(env, 'robo-a')).toEqual([]);
		expect(await storedKeys()).toEqual([]);
	});

	it('refuses no files, and more files than one request may carry', async () => {
		expect(await addImages(env, 'robo-a', [])).toEqual({ ok: false, error: 'no-files', added: 0 });
		const tooMany = Array.from({ length: GALLERY_LIMITS.maxFilesPerRequest + 1 }, () => upload(pngBytes(1, 1)));
		expect(await addImages(env, 'robo-a', tooMany)).toEqual({ ok: false, error: 'too-many-files', added: 0 });
	});

	it('refuses an unknown Robô and stores nothing', async () => {
		expect(await addImages(env, 'no-such-robot', [upload(pngBytes(1, 1))])).toEqual({ ok: false, error: 'not-found', added: 0 });
		expect(await storedKeys()).toEqual([]);
	});

	it('refuses the 13th item with gallery-full', async () => {
		await fillGallery('robo-a', GALLERY_LIMITS.maxItems);

		const result = await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);

		expect(result).toEqual({ ok: false, error: 'gallery-full', added: 0 });
		expect(await listGallery(env, 'robo-a')).toHaveLength(GALLERY_LIMITS.maxItems);
		expect(await storedKeys()).toHaveLength(GALLERY_LIMITS.maxItems);
	}, FILL_TIMEOUT);

	it('lets only one of two concurrent uploads take the last slot, and leaves no object for the other', async () => {
		await fillGallery('robo-a', GALLERY_LIMITS.maxItems - 1);

		const results = await Promise.all([
			addImages(env, 'robo-a', [upload(pngBytes(1, 1))]),
			addImages(env, 'robo-a', [upload(pngBytes(2, 2))]),
		]);

		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'gallery-full', added: 0 }]);
		expect(await listGallery(env, 'robo-a')).toHaveLength(GALLERY_LIMITS.maxItems);
		expect(await storedKeys()).toHaveLength(GALLERY_LIMITS.maxItems);
	}, FILL_TIMEOUT);

	it('deletes the stored object again when the row insert fails', async () => {
		const failingDb = new Proxy(env.DB, {
			get(target, property) {
				if (property !== 'prepare') {
					const value = Reflect.get(target, property);
					return typeof value === 'function' ? value.bind(target) : value;
				}
				return (sql: string) => {
					if (sql.includes('INSERT INTO robot_gallery_items')) throw new Error('D1 unavailable');
					return target.prepare(sql);
				};
			},
		});

		await expect(addImages({ ...env, DB: failingDb }, 'robo-a', [upload(pngBytes(1, 1))])).rejects.toThrow('D1 unavailable');

		expect(await storedKeys()).toEqual([]);
		expect(await listGallery(env, 'robo-a')).toEqual([]);
	});
});

describe('parseYoutubeUrl', () => {
	const id = 'dQw4w9WgXcQ';

	it.each([
		`https://www.youtube.com/watch?v=${id}`,
		`https://youtube.com/watch?v=${id}`,
		`http://www.youtube.com/watch?v=${id}`,
		`https://m.youtube.com/watch?v=${id}`,
		`https://www.youtube.com/watch?feature=share&v=${id}&t=42s`,
		`https://www.youtube.com/watch?v=${id}&list=PL123&index=2&si=abc`,
		`https://youtu.be/${id}`,
		`https://youtu.be/${id}?si=tracking123&t=10`,
		`https://www.youtube.com/shorts/${id}`,
		`https://youtube.com/shorts/${id}?feature=share`,
		`https://www.youtube.com/embed/${id}`,
		`https://www.youtube.com/embed/${id}?start=5`,
		`https://www.youtube.com/watch/?v=${id}`,
		`https://youtu.be/${id}/`,
		`https://youtu.be/${id}/extra`,
		`https://www.youtube.com/embed/${id}/extra/more`,
		`https://www.youtube.com/shorts/${id}/`,
		`  www.youtube.com/watch?v=${id}  `,
		`youtu.be/${id}`,
		`https://WWW.YouTube.com/watch?v=${id}`,
	])('keeps only the id of %s', (url) => {
		expect(parseYoutubeUrl(url)).toBe(id);
	});

	it.each([
		['empty', ''],
		['blank', '   '],
		['not a URL', 'just some text'],
		['a bare id', id],
		['another host', `https://vimeo.com/${id}`],
		['a lookalike host', `https://youtube.com.evil.example/watch?v=${id}`],
		['a lookalike prefix', `https://notyoutube.com/watch?v=${id}`],
		['a youtu.be lookalike', `https://youtu.be.evil.example/${id}`],
		['credentials pointing elsewhere', `https://youtube.com@evil.example/watch?v=${id}`],
		['a non-web scheme', `javascript://youtube.com/watch?v=${id}`],
		['a short id', 'https://youtu.be/abc'],
		['a long id', `https://youtu.be/${id}X`],
		['an id with forbidden characters', 'https://www.youtube.com/watch?v=dQw4w9WgX<Q'],
		['a watch URL without v', 'https://www.youtube.com/watch?list=PL123'],
		['a channel page', 'https://www.youtube.com/@somechannel'],
		['a playlist', 'https://www.youtube.com/playlist?list=PL1234567890'],
		['a non-default port', `https://www.youtube.com:8443/watch?v=${id}`],
	])('refuses %s', (_label, url) => {
		expect(parseYoutubeUrl(url)).toBeNull();
	});
});

describe('addVideo', () => {
	it('stores only the YouTube id, after the existing items', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);

		const result = await addVideo(env, 'robo-a', 'https://youtu.be/dQw4w9WgXcQ?si=tracking');

		expect(result).toEqual({ ok: true });
		const items = await listGallery(env, 'robo-a');
		expect(items.map((i) => i.kind)).toEqual(['image', 'video']);
		expect(items[1]).toMatchObject({ kind: 'video', youtubeId: 'dQw4w9WgXcQ', caption: null });
		expect(await storedKeys()).toHaveLength(1);
	});

	it('refuses an invalid link with invalid-youtube-url and stores nothing', async () => {
		expect(await addVideo(env, 'robo-a', 'https://vimeo.com/123')).toEqual({ ok: false, error: 'invalid-youtube-url' });
		expect(await listGallery(env, 'robo-a')).toEqual([]);
	});

	it('refuses an unknown Robô', async () => {
		expect(await addVideo(env, 'no-such-robot', 'https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: false, error: 'not-found' });
	});

	it('counts videos and images together toward the cap', async () => {
		await fillGallery('robo-a', GALLERY_LIMITS.maxItems - 1);

		expect(await addVideo(env, 'robo-a', 'https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: true });
		expect(await addVideo(env, 'robo-a', 'https://youtu.be/aaaaaaaaaaa')).toEqual({ ok: false, error: 'gallery-full' });
		expect(await addImages(env, 'robo-a', [upload(pngBytes(1, 1))])).toEqual({ ok: false, error: 'gallery-full', added: 0 });
		expect(await listGallery(env, 'robo-a')).toHaveLength(GALLERY_LIMITS.maxItems);
	}, FILL_TIMEOUT);

	it('removes a video by deleting its row only', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);
		await addVideo(env, 'robo-a', 'https://youtu.be/dQw4w9WgXcQ');
		const [image, video] = await listGallery(env, 'robo-a');

		expect(await removeItem(env, 'robo-a', video.id)).toEqual({ ok: true });

		expect(await listGallery(env, 'robo-a')).toEqual([image]);
		expect(await storedKeys()).toEqual([`gallery/${image.id}`]);
	});

	it('is never served by the media route', async () => {
		await seedRobot({ slug: 'robo-pub', status: 'available', offers: { one_time: 99700 } });
		await addVideo(env, 'robo-pub', 'https://youtu.be/dQw4w9WgXcQ');
		const [video] = await listGallery(env, 'robo-pub');

		expect(await openMedia(env, video.id, async () => true)).toEqual({ ok: false });
	});
});

describe('YouTube URLs rebuilt from the id', () => {
	it('embeds through the privacy-enhanced host and shows the static thumbnail', () => {
		expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
		expect(youtubeThumbnailUrl('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
	});
});

describe('setCaption', () => {
	async function oneItem(): Promise<string> {
		await addVideo(env, 'robo-a', 'https://youtu.be/dQw4w9WgXcQ');
		return (await listGallery(env, 'robo-a'))[0].id;
	}

	it('saves a trimmed caption, and a blank one clears it', async () => {
		const id = await oneItem();

		expect(await setCaption(env, 'robo-a', id, '  Robô operando no Mini Índice  ')).toEqual({ ok: true });
		expect((await listGallery(env, 'robo-a'))[0].caption).toBe('Robô operando no Mini Índice');

		expect(await setCaption(env, 'robo-a', id, '   ')).toEqual({ ok: true });
		expect((await listGallery(env, 'robo-a'))[0].caption).toBeNull();
	});

	it('accepts exactly the limit and refuses one character more, keeping the old caption', async () => {
		const id = await oneItem();
		await setCaption(env, 'robo-a', id, 'antes');

		expect(await setCaption(env, 'robo-a', id, 'a'.repeat(GALLERY_LIMITS.maxCaptionLength + 1))).toEqual({
			ok: false,
			error: 'caption-too-long',
		});
		expect((await listGallery(env, 'robo-a'))[0].caption).toBe('antes');

		expect(await setCaption(env, 'robo-a', id, 'é'.repeat(GALLERY_LIMITS.maxCaptionLength))).toEqual({ ok: true });
	});

	it('answers not-found for another Robô item and changes nothing', async () => {
		await seedRobot({ slug: 'robo-b', status: 'draft' });
		await addVideo(env, 'robo-b', 'https://youtu.be/dQw4w9WgXcQ');
		const [other] = await listGallery(env, 'robo-b');

		expect(await setCaption(env, 'robo-a', other.id, 'hijack')).toEqual({ ok: false, error: 'not-found' });
		expect((await listGallery(env, 'robo-b'))[0].caption).toBeNull();
	});
});

describe('reorder and move', () => {
	const videoIds = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'];
	const order = async (slug = 'robo-a') => (await listGallery(env, slug)).map((i) => (i.kind === 'video' ? i.youtubeId[0] : '?'));

	beforeEach(async () => {
		for (const id of videoIds) await addVideo(env, 'robo-a', `https://youtu.be/${id}`);
	});

	it('rewrites positions in the order given', async () => {
		const items = await listGallery(env, 'robo-a');

		expect(await reorderGallery(env, 'robo-a', [items[3].id, items[1].id, items[0].id, items[2].id])).toEqual({ ok: true });

		expect(await order()).toEqual(['d', 'b', 'a', 'c']);
	});

	it('puts the items a partial list leaves out after it, in their current order', async () => {
		const items = await listGallery(env, 'robo-a');

		await reorderGallery(env, 'robo-a', [items[2].id]);

		expect(await order()).toEqual(['c', 'a', 'b', 'd']);
	});

	it('ignores foreign, stale and repeated ids, never creating or moving anything outside the Robô', async () => {
		await seedRobot({ slug: 'robo-b', status: 'draft' });
		await addVideo(env, 'robo-b', 'https://youtu.be/zzzzzzzzzzz');
		const [foreign] = await listGallery(env, 'robo-b');
		const items = await listGallery(env, 'robo-a');

		await reorderGallery(env, 'robo-a', [foreign.id, 'stale-id', items[1].id, items[1].id, items[0].id]);

		expect(await order()).toEqual(['b', 'a', 'c', 'd']);
		expect(await listGallery(env, 'robo-a')).toHaveLength(4);
		expect(await listGallery(env, 'robo-b')).toEqual([foreign]);
	});

	it('moves an item up and down one place', async () => {
		const items = await listGallery(env, 'robo-a');

		expect(await moveItem(env, 'robo-a', items[2].id, 'up')).toEqual({ ok: true });
		expect(await order()).toEqual(['a', 'c', 'b', 'd']);

		expect(await moveItem(env, 'robo-a', items[0].id, 'down')).toEqual({ ok: true });
		expect(await order()).toEqual(['c', 'a', 'b', 'd']);
	});

	it('treats moving the first item up or the last item down as a harmless no-op', async () => {
		const items = await listGallery(env, 'robo-a');

		expect(await moveItem(env, 'robo-a', items[0].id, 'up')).toEqual({ ok: true });
		expect(await moveItem(env, 'robo-a', items[3].id, 'down')).toEqual({ ok: true });

		expect(await order()).toEqual(['a', 'b', 'c', 'd']);
	});

	it('answers not-found for an id that is not this Robô item', async () => {
		expect(await moveItem(env, 'robo-a', 'stale-id', 'up')).toEqual({ ok: false, error: 'not-found' });
		expect(await order()).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('removeItem', () => {
	it('deletes the row and the stored object', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1)), upload(pngBytes(2, 2))]);
		const [first, second] = await listGallery(env, 'robo-a');

		expect(await removeItem(env, 'robo-a', first.id)).toEqual({ ok: true });

		expect(await listGallery(env, 'robo-a')).toEqual([second]);
		expect(await storedKeys()).toEqual([`gallery/${second.id}`]);
	});

	it('still removes the row when its object is already gone', async () => {
		await addImages(env, 'robo-a', [upload(pngBytes(1, 1))]);
		const [item] = await listGallery(env, 'robo-a');
		await env.ROBOT_MEDIA.delete(`gallery/${item.id}`);

		expect(await removeItem(env, 'robo-a', item.id)).toEqual({ ok: true });
		expect(await listGallery(env, 'robo-a')).toEqual([]);
	});

	it('answers not-found for an unknown id or another Robô item, and changes nothing', async () => {
		await seedRobot({ slug: 'robo-b', status: 'draft' });
		await addImages(env, 'robo-b', [upload(pngBytes(1, 1))]);
		const [other] = await listGallery(env, 'robo-b');

		expect(await removeItem(env, 'robo-a', other.id)).toEqual({ ok: false, error: 'not-found' });
		expect(await removeItem(env, 'robo-a', 'no-such-id')).toEqual({ ok: false, error: 'not-found' });
		expect(await listGallery(env, 'robo-b')).toEqual([other]);
		expect(await storedKeys()).toHaveLength(1);
	});
});

describe('openMedia', () => {
	const notAdmin = async () => false;
	const admin = async () => true;

	async function imageOn(status: 'draft' | 'available' | 'coming-soon' | 'archived'): Promise<{ id: string; bytes: Uint8Array }> {
		const slug = `robo-${status}`;
		await seedRobot({ slug, status, offers: { one_time: 99700 } });
		const bytes = jpegBytes(4, 3, 64);
		await addImages(env, slug, [upload(bytes)]);
		const [item] = await listGallery(env, slug);
		return { id: item.id, bytes };
	}

	it.each(['available', 'coming-soon'] as const)('serves the image of a %s Robô to anyone, publicly cacheable', async (status) => {
		const { id, bytes } = await imageOn(status);

		const result = await openMedia(env, id, notAdmin);

		expect(result).toMatchObject({ ok: true, contentType: 'image/jpeg', size: bytes.byteLength, cache: 'public' });
		if (!result.ok) throw new Error('expected ok');
		expect(await readBody(result.body)).toEqual(bytes);
	});

	it('serves a draft only to an admin, privately', async () => {
		const { id } = await imageOn('draft');

		expect(await openMedia(env, id, notAdmin)).toEqual({ ok: false });
		const result = await openMedia(env, id, admin);
		expect(result).toMatchObject({ ok: true, cache: 'private' });
		if (result.ok) await result.body.cancel();
	});

	it('serves an archived Robô only to an admin (its edit page), privately', async () => {
		const { id } = await imageOn('archived');

		expect(await openMedia(env, id, notAdmin)).toEqual({ ok: false });
		const result = await openMedia(env, id, admin);
		expect(result).toMatchObject({ ok: true, cache: 'private' });
		if (result.ok) await result.body.cancel();
	});

	it('refuses an unknown id and an item whose object is missing', async () => {
		const { id } = await imageOn('available');
		await env.ROBOT_MEDIA.delete(`gallery/${id}`);

		expect(await openMedia(env, id, admin)).toEqual({ ok: false });
		expect(await openMedia(env, 'no-such-id', admin)).toEqual({ ok: false });
	});
});
