// Tiny image fixtures for the Robô gallery tests (.scratch/robot-gallery/spec.md, Testing
// Decisions: "small fixture images are generated in the test, not committed as binaries"). Each
// is only the header bytes the gallery module sniffs (magic number and pixel size), plus
// optional padding; none is a decodable picture, which the module never needs.

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const withPadding = (bytes: number[], padTo = 0): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(Math.max(bytes.length, padTo));
	out.set(bytes);
	return out;
};

/** PNG signature and IHDR chunk. */
export const pngBytes = (width: number, height: number, padTo = 0) =>
	withPadding(
		[
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
			...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, 0, 0, 0, 0,
			...u32be(0), ...ascii('IEND'), 0, 0, 0, 0,
		],
		padTo
	);

/** JPEG: SOI, an APP0 segment to skip, then SOF0 with the pixel size, then EOI. */
export const jpegBytes = (width: number, height: number, padTo = 0) =>
	withPadding(
		[
			0xff, 0xd8,
			0xff, 0xe0, ...u16be(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
			0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
			0xff, 0xd9,
		],
		padTo
	);

/** WebP, extended format (VP8X chunk carries the canvas size minus one). */
export const webpBytes = (width: number, height: number, padTo = 0) =>
	withPadding([...ascii('RIFF'), ...u32be(0), ...ascii('WEBP'), ...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)], padTo);

/** WebP, lossy (VP8 frame header). */
export const webpLossyBytes = (width: number, height: number) =>
	withPadding([...ascii('RIFF'), ...u32be(0), ...ascii('WEBP'), ...ascii('VP8 '), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]);

/** WebP, lossless (VP8L: 14-bit width-1 and height-1 packed after the 0x2f signature). */
export const webpLosslessBytes = (width: number, height: number) => {
	const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
	return withPadding([...ascii('RIFF'), ...u32be(0), ...ascii('WEBP'), ...ascii('VP8L'), 0, 0, 0, 0, 0x2f, packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >>> 24) & 0xff]);
};

/** AVIF: an `ftyp` box with the avif brand, then a box holding an `ispe` (image spatial extents). */
export const avifBytes = (width: number, height: number, padTo = 0) =>
	withPadding(
		[
			...u32be(24), ...ascii('ftyp'), ...ascii('avif'), ...u32be(0), ...ascii('mif1'), ...ascii('avif'),
			...u32be(28), ...ascii('meta'), 0, 0, 0, 0,
			...u32be(20), ...ascii('ispe'), 0, 0, 0, 0, ...u32be(width), ...u32be(height),
		],
		padTo
	);

export const svgBytes = () =>
	new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');

export const htmlBytes = () => new TextEncoder().encode('<!doctype html><html><body><script>alert(1)</script></body></html>');

/** A browser-style upload: the filename and claimed type are whatever the test says, never trusted. */
export const upload = (bytes: Uint8Array<ArrayBuffer>, name = 'image.png', type = 'image/png') => new File([bytes], name, { type });
