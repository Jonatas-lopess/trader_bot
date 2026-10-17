/**
 * Judges an uploaded gallery image by its bytes alone (docs/adr/0009-robot-gallery-media-bucket.md):
 * the magic number picks the type (JPEG, PNG, WebP, AVIF; no SVG, which is a document that can
 * carry script) and the header gives the pixel size. The filename and the browser's claimed type
 * are never consulted. Used by `./gallery.ts` before anything is stored.
 */

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

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
