/**
 * Robô gallery — .scratch/robot-gallery/spec.md, docs/adr/0009-robot-gallery-media-bucket.md.
 *
 * The one module that knows `robot_gallery_items` (migration 0017) and the `ROBOT_MEDIA` bucket,
 * as `./robots.ts` is for `robots`. An item is an image (bytes in R2 at `gallery/<id>`, never
 * keyed by slug, so a rename moves no object) or a YouTube video (only the 11-character id is
 * stored; embed and thumbnail URLs are rebuilt from it, so a pasted URL is never reflected).
 *
 * Callers (the `/admin/robos/<slug>/galeria/*` routes) have already passed `gateAdmin`. Every
 * rule is kept here: an image's type is judged by its leading bytes (`./image-sniff.ts`), never
 * by the filename or the browser's claim; a video is a YouTube id (`./youtube.ts`); size,
 * per-request file count, per-Robô item cap and caption length are bounded; the media route's
 * status gate is `openMedia`. Results are codes, never copy (`src/content/admin.ts` words them);
 * the URLs around the gallery are built in `./gallery-paths.ts`.
 *
 * Write order keeps the gallery from ever showing a broken image: add puts the object first and
 * deletes it again if the row is refused; remove deletes the row first, then the object (a
 * leaked object is invisible). The cap and the position are decided inside the INSERT, so two
 * concurrent uploads cannot exceed the cap.
 */

import { sniffImage, type ImageContentType } from './image-sniff';
import { parseYoutubeUrl } from './youtube';

type GalleryEnv = Pick<Cloudflare.Env, 'DB' | 'ROBOT_MEDIA'>;

export const GALLERY_LIMITS = {
	/** Bytes per image. Nothing is resized (10 ms CPU), so the admin is told the limit instead. */
	maxImageBytes: 5 * 1024 * 1024,
	maxItems: 12,
	maxCaptionLength: 140,
	maxFilesPerRequest: 5,
} as const;

/**
 * Hard ceiling on an upload request's declared `Content-Length`, checked before the body is
 * read: the largest legitimate request (every file at the limit) plus room for the multipart
 * framing and the other form fields.
 */
export const MAX_UPLOAD_REQUEST_BYTES = GALLERY_LIMITS.maxFilesPerRequest * GALLERY_LIMITS.maxImageBytes + 64 * 1024;

export type GalleryErrorCode =
	| 'no-files'
	| 'too-many-files'
	| 'file-too-large'
	| 'unsupported-type'
	| 'unreadable-image'
	| 'gallery-full'
	| 'invalid-youtube-url'
	| 'caption-too-long'
	| 'request-too-large'
	| 'not-found';

type ItemBase = { id: string; robotSlug: string; position: number; caption: string | null };
export type GalleryImage = ItemBase & {
	kind: 'image';
	contentType: ImageContentType;
	byteSize: number;
	width: number;
	height: number;
};
export type GalleryVideo = ItemBase & { kind: 'video'; youtubeId: string };
export type GalleryItem = GalleryImage | GalleryVideo;

type ItemRow = {
	id: string;
	robot_slug: string;
	kind: 'image' | 'video';
	position: number;
	caption: string | null;
	content_type: ImageContentType | null;
	byte_size: number | null;
	width: number | null;
	height: number | null;
	youtube_id: string | null;
};

const ITEM_COLUMNS = 'id, robot_slug, kind, position, caption, content_type, byte_size, width, height, youtube_id';

function toItem(row: ItemRow): GalleryItem {
	const base = { id: row.id, robotSlug: row.robot_slug, position: row.position, caption: row.caption };
	if (row.kind === 'video') return { ...base, kind: 'video', youtubeId: row.youtube_id ?? '' };
	return {
		...base,
		kind: 'image',
		contentType: row.content_type ?? 'image/png',
		byteSize: row.byte_size ?? 0,
		width: row.width ?? 0,
		height: row.height ?? 0,
	};
}

/** Where an item's bytes live in `ROBOT_MEDIA`: by item id, never by slug. */
const mediaKey = (id: string) => `gallery/${id}`;

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

/** A Robô's items in display order. Any status: the admin works on drafts too. */
export async function listGallery(env: Pick<GalleryEnv, 'DB'>, slug: string): Promise<GalleryItem[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${ITEM_COLUMNS} FROM robot_gallery_items WHERE robot_slug = ? ORDER BY position, created_at, id`
	)
		.bind(slug)
		.all<ItemRow>();
	return results.map(toItem);
}

/**
 * The catalog's read side: every published Robô's gallery (`available`, `coming-soon`), keyed by
 * slug, each in display order; a Robô with no media has no entry. With `includeDrafts` (the
 * admin preview on `/catalog`, after `requireAdmin`) drafts are included too. Archived never.
 */
export async function listPublishedGalleries(
	env: Pick<GalleryEnv, 'DB'>,
	options: { includeDrafts?: boolean } = {}
): Promise<Map<string, GalleryItem[]>> {
	// Constant SQL lists, never user input.
	const statuses = options.includeDrafts ? "'available', 'coming-soon', 'draft'" : "'available', 'coming-soon'";
	const { results } = await env.DB.prepare(
		`SELECT ${ITEM_COLUMNS.split(', ').map((c) => `g.${c}`).join(', ')}
		FROM robot_gallery_items g JOIN robots r ON r.slug = g.robot_slug
		WHERE r.status IN (${statuses})
		ORDER BY g.robot_slug, g.position, g.created_at, g.id`
	).all<ItemRow>();
	const bySlug = new Map<string, GalleryItem[]>();
	for (const row of results) bySlug.set(row.robot_slug, [...(bySlug.get(row.robot_slug) ?? []), toItem(row)]);
	return bySlug;
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export type AddResult = { ok: true; added: number } | { ok: false; error: GalleryErrorCode; added: number };

async function robotExists(env: Pick<GalleryEnv, 'DB'>, slug: string): Promise<boolean> {
	return (await env.DB.prepare('SELECT 1 AS hit FROM robots WHERE slug = ?').bind(slug).first()) !== null;
}

async function countItems(env: Pick<GalleryEnv, 'DB'>, slug: string): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM robot_gallery_items WHERE robot_slug = ?').bind(slug).first<{ n: number }>();
	return row?.n ?? 0;
}

type NewItem =
	| { kind: 'image'; key: string; contentType: ImageContentType; byteSize: number; width: number; height: number }
	| { kind: 'video'; youtubeId: string };

/**
 * One guarded INSERT: the row lands only while the Robô exists and holds fewer than the cap,
 * at the next position. D1 runs one statement at a time, so the count and the write cannot be
 * interleaved by a concurrent upload. `false` means refused (full, or the Robô is gone).
 */
async function insertItem(env: Pick<GalleryEnv, 'DB'>, slug: string, id: string, item: NewItem): Promise<boolean> {
	const image = item.kind === 'image' ? item : null;
	const result = await env.DB.prepare(
		`INSERT INTO robot_gallery_items
			(id, robot_slug, kind, position, caption, r2_key, content_type, byte_size, width, height, youtube_id)
		SELECT ?, ?, ?, COALESCE((SELECT MAX(position) FROM robot_gallery_items WHERE robot_slug = ?), -1) + 1,
			NULL, ?, ?, ?, ?, ?, ?
		WHERE EXISTS (SELECT 1 FROM robots WHERE slug = ?)
			AND (SELECT COUNT(*) FROM robot_gallery_items WHERE robot_slug = ?) < ?`
	)
		.bind(
			id,
			slug,
			item.kind,
			slug,
			image?.key ?? null,
			image?.contentType ?? null,
			image?.byteSize ?? null,
			image?.width ?? null,
			image?.height ?? null,
			item.kind === 'video' ? item.youtubeId : null,
			slug,
			slug,
			GALLERY_LIMITS.maxItems
		)
		.run();
	return result.meta.changes > 0;
}

type CheckedImage = { bytes: Uint8Array; contentType: ImageContentType; width: number; height: number };

/**
 * Adds uploaded images, in the order given. Every file is checked before anything is stored, so
 * one bad file refuses the whole request and stores nothing. Each accepted file is put in R2
 * first, then its row is inserted under the cap; a refused or failed insert deletes the object
 * again. When a concurrent upload fills the gallery midway, the files already added stay and the
 * result is `gallery-full` with their count.
 */
export async function addImages(env: GalleryEnv, slug: string, files: readonly Blob[]): Promise<AddResult> {
	if (files.length === 0) return { ok: false, error: 'no-files', added: 0 };
	if (files.length > GALLERY_LIMITS.maxFilesPerRequest) return { ok: false, error: 'too-many-files', added: 0 };
	if (files.some((file) => file.size > GALLERY_LIMITS.maxImageBytes)) return { ok: false, error: 'file-too-large', added: 0 };

	const checked: CheckedImage[] = [];
	for (const file of files) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const sniffed = sniffImage(bytes);
		if (!sniffed.ok) return { ok: false, error: sniffed.error, added: 0 };
		checked.push({ bytes, contentType: sniffed.contentType, width: sniffed.width, height: sniffed.height });
	}

	if (!(await robotExists(env, slug))) return { ok: false, error: 'not-found', added: 0 };
	if ((await countItems(env, slug)) + checked.length > GALLERY_LIMITS.maxItems) return { ok: false, error: 'gallery-full', added: 0 };

	let added = 0;
	for (const image of checked) {
		const id = crypto.randomUUID();
		const key = mediaKey(id);
		await env.ROBOT_MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.contentType } });
		let inserted: boolean;
		try {
			inserted = await insertItem(env, slug, id, {
				kind: 'image',
				key,
				contentType: image.contentType,
				byteSize: image.bytes.byteLength,
				width: image.width,
				height: image.height,
			});
		} catch (error) {
			await env.ROBOT_MEDIA.delete(key);
			throw error;
		}
		if (!inserted) {
			await env.ROBOT_MEDIA.delete(key);
			return { ok: false, error: (await robotExists(env, slug)) ? 'gallery-full' : 'not-found', added };
		}
		added++;
	}
	return { ok: true, added };
}

export type ItemResult = { ok: true } | { ok: false; error: GalleryErrorCode };

/** Adds a video from a pasted YouTube link; only its id is stored. Counts toward the same cap as images. */
export async function addVideo(env: Pick<GalleryEnv, 'DB'>, slug: string, url: string): Promise<ItemResult> {
	const youtubeId = parseYoutubeUrl(url);
	if (youtubeId === null) return { ok: false, error: 'invalid-youtube-url' };
	if (await insertItem(env, slug, crypto.randomUUID(), { kind: 'video', youtubeId })) return { ok: true };
	return { ok: false, error: (await robotExists(env, slug)) ? 'gallery-full' : 'not-found' };
}

/**
 * Sets an item's caption (also its alt text). Trimmed; blank clears it; longer than the limit
 * (in characters, not bytes) is `caption-too-long` and keeps the old one.
 */
export async function setCaption(env: Pick<GalleryEnv, 'DB'>, slug: string, id: string, caption: string): Promise<ItemResult> {
	const text = caption.trim();
	if ([...text].length > GALLERY_LIMITS.maxCaptionLength) return { ok: false, error: 'caption-too-long' };
	const result = await env.DB.prepare('UPDATE robot_gallery_items SET caption = ? WHERE id = ? AND robot_slug = ?')
		.bind(text === '' ? null : text, id, slug)
		.run();
	return result.meta.changes > 0 ? { ok: true } : { ok: false, error: 'not-found' };
}

/**
 * Moves one item a place up or down. Up on the first and down on the last change nothing.
 * The swapped order is written back as positions in one D1 batch, every UPDATE scoped to the
 * Robô, so nothing outside it moves and nothing is created.
 */
export async function moveItem(env: Pick<GalleryEnv, 'DB'>, slug: string, id: string, direction: 'up' | 'down'): Promise<ItemResult> {
	const order = (await listGallery(env, slug)).map((item) => item.id);
	const from = order.indexOf(id);
	if (from < 0) return { ok: false, error: 'not-found' };
	const to = direction === 'up' ? from - 1 : from + 1;
	if (to < 0 || to >= order.length) return { ok: true };
	[order[from], order[to]] = [order[to], order[from]];
	await env.DB.batch(
		order.map((itemId, position) =>
			env.DB.prepare('UPDATE robot_gallery_items SET position = ? WHERE id = ? AND robot_slug = ?').bind(position, itemId, slug)
		)
	);
	return { ok: true };
}

/**
 * The statement that moves a Robô's gallery rows to its new slug, for the rename batch in
 * `updateRobot` (`./admin.ts`). Like the Ofertas statement next to it, it acts only once the old
 * slug is gone from `robots`, so a rename the SQL guard refused moves nothing. R2 keys hold the
 * item id, not the slug, so no object moves.
 */
export const renameGalleryStatement = (env: Pick<GalleryEnv, 'DB'>, fromSlug: string, toSlug: string): D1PreparedStatement =>
	env.DB.prepare(
		'UPDATE robot_gallery_items SET robot_slug = ? WHERE robot_slug = ? AND NOT EXISTS (SELECT 1 FROM robots WHERE slug = ?)'
	).bind(toSlug, fromSlug, fromSlug);

/**
 * Removes one item of this Robô: the row first, then the stored file (an image's object; a
 * video has none). A missing object does not block removal. An id that is unknown or belongs to
 * another Robô is `not-found` and changes nothing.
 */
export async function removeItem(env: GalleryEnv, slug: string, id: string): Promise<ItemResult> {
	const row = await env.DB.prepare('SELECT r2_key FROM robot_gallery_items WHERE id = ? AND robot_slug = ?')
		.bind(id, slug)
		.first<{ r2_key: string | null }>();
	if (!row) return { ok: false, error: 'not-found' };
	const deleted = await env.DB.prepare('DELETE FROM robot_gallery_items WHERE id = ? AND robot_slug = ?').bind(id, slug).run();
	if (deleted.meta.changes === 0) return { ok: false, error: 'not-found' };
	if (row.r2_key !== null) {
		try {
			await env.ROBOT_MEDIA.delete(row.r2_key);
		} catch (error) {
			// The row is gone, so the object is unreachable; a leak is harmless (spec, Out of Scope).
			console.error(`removeItem: R2 delete failed for key=${row.r2_key}`, error);
		}
	}
	return { ok: true };
}

// ---------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------

export type OpenMediaResult =
	| { ok: true; body: ReadableStream; contentType: ImageContentType; size: number; cache: 'public' | 'private' }
	| { ok: false };

/**
 * The bytes of an image item for the public media route. Served only while its Robô is
 * published (`available`, `coming-soon`): `cache: 'public'`, since an id never maps to other
 * bytes. A `draft` or `archived` Robô's image is served only when `isAdmin()` says so (the
 * catalog preview of a draft, and the thumbnails on any Robô's edit page), with
 * `cache: 'private'`. Anything else (an anonymous caller on an unpublished Robô, an unknown id, a
 * video, an object missing from the bucket) is `{ ok: false }`, which the route answers with a
 * plain 404.
 */
export async function openMedia(env: GalleryEnv, id: string, isAdmin: () => Promise<boolean>): Promise<OpenMediaResult> {
	const row = await env.DB.prepare(
		`SELECT g.r2_key AS r2_key, g.content_type AS content_type, r.status AS status
		FROM robot_gallery_items g JOIN robots r ON r.slug = g.robot_slug
		WHERE g.id = ? AND g.kind = 'image'`
	)
		.bind(id)
		.first<{ r2_key: string; content_type: ImageContentType; status: string }>();
	if (!row) return { ok: false };

	let cache: 'public' | 'private';
	if (row.status === 'available' || row.status === 'coming-soon') cache = 'public';
	else if ((row.status === 'draft' || row.status === 'archived') && (await isAdmin())) cache = 'private';
	else return { ok: false };

	const object = await env.ROBOT_MEDIA.get(row.r2_key);
	if (object === null) return { ok: false };
	return { ok: true, body: object.body, contentType: row.content_type, size: object.size, cache };
}
