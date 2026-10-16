/**
 * Robô gallery — .scratch/robot-gallery/spec.md, docs/adr/0009-robot-gallery-media-bucket.md.
 *
 * The one module that knows `robot_gallery_items` (migration 0016) and the `ROBOT_MEDIA` bucket,
 * as `./robots.ts` is for `robots`. An item is an image (bytes in R2 at `gallery/<id>`, never
 * keyed by slug, so a rename moves no object) or a YouTube video (only the 11-character id is
 * stored; embed and thumbnail URLs are rebuilt from it, so a pasted URL is never reflected).
 *
 * Callers (the `/admin/robos/<slug>/galeria/*` routes) have already passed `gateAdmin`. Every
 * rule is kept here: an image's type is judged by its leading bytes (JPEG, PNG, WebP, AVIF; no
 * SVG), never by the filename or the browser's claim; its pixel size comes from the header;
 * size, per-request file count, per-Robô item cap and caption length are bounded. Results are
 * codes, never copy (`src/content/admin.ts` words them).
 *
 * Write order keeps the gallery from ever showing a broken image: add puts the object first and
 * deletes it again if the row is refused; remove deletes the row first, then the object (a
 * leaked object is invisible). The cap and the position are decided inside the INSERT, so two
 * concurrent uploads cannot exceed the cap.
 */

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

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

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

/** The public URL of an image item (the status-gated media route). */
export const mediaPath = (id: string): string => `/media/${encodeURIComponent(id)}`;

/** The gallery section of a Robô's edit page, where every gallery action returns. */
export const galleryAnchor = 'galeria';
export const galleryPagePath = (slug: string): string => `/admin/robos/${encodeURIComponent(slug)}#${galleryAnchor}`;

/** Flash keys a successful gallery action redirects with (`?ok=`); worded in `src/content/admin.ts`. */
export type GalleryFlashKey = 'gallery-added' | 'gallery-removed';

/**
 * The 303 after a gallery POST: back to the edit page's gallery section with a flash key or an
 * error code, never free text (the page looks both up in its content file).
 */
export function galleryRedirect(origin: string, slug: string, outcome: { ok: GalleryFlashKey } | { error: GalleryErrorCode }): Response {
	const target = new URL(`/admin/robos/${encodeURIComponent(slug)}`, origin);
	if ('ok' in outcome) target.searchParams.set('ok', outcome.ok);
	else target.searchParams.set('error', outcome.error);
	target.hash = galleryAnchor;
	return new Response(null, { status: 303, headers: { Location: target.toString() } });
}

// ---------------------------------------------------------------------
// Image sniffing
// ---------------------------------------------------------------------

export type SniffedImage = { ok: true; contentType: ImageContentType; width: number; height: number } | { ok: false; error: 'unsupported-type' | 'unreadable-image' };

const startsWith = (bytes: Uint8Array, at: number, expected: readonly number[]) =>
	bytes.length >= at + expected.length && expected.every((b, i) => bytes[at + i] === b);
const asciiAt = (bytes: Uint8Array, at: number, text: string) =>
	startsWith(bytes, at, [...text].map((c) => c.charCodeAt(0)));
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);

type Size = { width: number; height: number } | null;

function pngSize(b: Uint8Array): Size {
	if (b.length < 24 || !asciiAt(b, 12, 'IHDR')) return null;
	return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** Walks the JPEG segments to the first start-of-frame marker, which carries the pixel size. */
function jpegSize(b: Uint8Array): Size {
	let at = 2;
	while (at + 4 <= b.length) {
		if (b[at] !== 0xff) return null;
		const marker = b[at + 1];
		if (marker === 0xff) {
			at += 1; // fill byte
			continue;
		}
		// Standalone markers carry no length.
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			at += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame header
		const length = u16be(b, at + 2);
		if (length < 2) return null;
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrame) {
			if (at + 9 > b.length) return null;
			return { height: u16be(b, at + 5), width: u16be(b, at + 7) };
		}
		at += 2 + length;
	}
	return null;
}

function webpSize(b: Uint8Array): Size {
	if (asciiAt(b, 12, 'VP8X') && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
	if (asciiAt(b, 12, 'VP8 ') && b.length >= 30 && startsWith(b, 23, [0x9d, 0x01, 0x2a])) {
		return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
	}
	if (asciiAt(b, 12, 'VP8L') && b.length >= 25 && b[20] === 0x2f) {
		const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
		return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	return null;
}

/** Whether an ISO-BMFF `ftyp` box names the AVIF brand, as major or compatible brand. */
function isAvif(b: Uint8Array): boolean {
	if (!asciiAt(b, 4, 'ftyp')) return false;
	const boxSize = Math.min(u32be(b, 0), b.length);
	const brands = ['avif', 'avis'];
	if (brands.some((brand) => asciiAt(b, 8, brand))) return true;
	for (let at = 16; at + 4 <= boxSize; at += 4) {
		if (brands.some((brand) => asciiAt(b, at, brand))) return true;
	}
	return false;
}

/**
 * The AVIF pixel size from its `ispe` (image spatial extents) properties. A grid image also has
 * one per tile, so the largest one is the picture's.
 */
function avifSize(b: Uint8Array): Size {
	let best: Size = null;
	for (let at = 4; at + 16 <= b.length; at++) {
		if (b[at] !== 0x69 || !asciiAt(b, at, 'ispe')) continue;
		const width = u32be(b, at + 8);
		const height = u32be(b, at + 12);
		if (!best || width * height > best.width * best.height) best = { width, height };
	}
	return best;
}

/**
 * Judges an upload by its bytes alone: the magic number picks the type, the header gives the
 * pixel size. Anything else (SVG, HTML, a renamed executable) is `unsupported-type`; a known
 * magic number whose header is cut short or nonsensical is `unreadable-image`.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage {
	let contentType: ImageContentType;
	let size: Size;
	if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) {
		contentType = 'image/jpeg';
		size = jpegSize(bytes);
	} else if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		contentType = 'image/png';
		size = pngSize(bytes);
	} else if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) {
		contentType = 'image/webp';
		size = webpSize(bytes);
	} else if (isAvif(bytes)) {
		contentType = 'image/avif';
		size = avifSize(bytes);
	} else {
		return { ok: false, error: 'unsupported-type' };
	}
	if (!size || size.width < 1 || size.height < 1 || size.width > 65535 || size.height > 65535) {
		return { ok: false, error: 'unreadable-image' };
	}
	return { ok: true, contentType, ...size };
}

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
