-- Robô gallery — .scratch/robot-gallery/spec.md, docs/adr/0009-robot-gallery-media-bucket.md.
--
-- One row per gallery item of a Robô: an image (bytes in the ROBOT_MEDIA bucket, never the
-- robot-binary bucket) or a video (a YouTube id, never a file). Only
-- `src/modules/catalog/gallery.ts` knows this table. As elsewhere in this codebase there is no
-- FK: the module keeps `robot_slug` consistent, and a slug rename moves these rows in the same
-- D1 batch as `robot_offers` (`updateRobot`). `r2_key` is built from the item id, never the
-- slug, so a rename moves no object. Nothing is seeded.
--
-- `position` orders the items of one Robô (gaps allowed, the module renumbers on reorder).
-- `caption` is optional and doubles as alt text. The CHECK ties the payload columns to the kind:
-- an image has its key, sniffed content type, byte size and pixel size and no video id; a video
-- has only its 11-character YouTube id.
CREATE TABLE robot_gallery_items (
	id TEXT PRIMARY KEY,
	robot_slug TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
	position INTEGER NOT NULL,
	caption TEXT,
	r2_key TEXT,
	content_type TEXT,
	byte_size INTEGER,
	width INTEGER,
	height INTEGER,
	youtube_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CHECK (
		(kind = 'image'
			AND r2_key IS NOT NULL AND content_type IS NOT NULL AND byte_size IS NOT NULL
			AND width IS NOT NULL AND height IS NOT NULL AND youtube_id IS NULL)
		OR
		(kind = 'video'
			AND youtube_id IS NOT NULL AND r2_key IS NULL AND content_type IS NULL AND byte_size IS NULL
			AND width IS NULL AND height IS NULL)
	)
) STRICT;

CREATE INDEX idx_robot_gallery_items_slug_position ON robot_gallery_items (robot_slug, position);
