# 03: Captions, reordering and slug rename

**What to build:** the admin edits a caption (optional, up to 140 characters; later used as alt text), moves items up and down, and renames a Robô's slug (still allowed only before any purchase) without orphaning its gallery.

- Caption edit is a small POST per item. Too-long caption is refused with `caption-too-long`.
- Reorder rewrites positions for the Robô's items in one D1 batch. Stale or foreign ids in the request are refused or ignored, never create items.
- Rename: the gallery rows follow the new slug in the same D1 batch that already moves `robot_offers` in `updateRobot`. R2 keys do not embed the slug, so no object moves.
- Move up/down are plain POST forms: works without JavaScript. Drag and drop is out of scope.
- Same gate order as ticket 01.

**Blocked by:** 01.

**Status:** ready-for-agent

TDD seams: gallery module (caption validation, reorder with valid, partial and foreign ids) and `catalog/admin` (rename carries the gallery; a refused rename carries nothing).

- [ ] Caption saves and shows; over 140 characters is refused; blank clears it
- [ ] Move up on the first item and move down on the last are harmless no-ops
- [ ] Reorder with foreign or stale ids changes nothing outside the Robô
- [ ] After a slug rename the same items, order and captions appear on the new slug, and the media route still serves them
- [ ] A rename refused because a purchase landed leaves the gallery on the old slug
- [ ] Non-admin 404 and cross-origin 403 on caption and reorder actions
- [ ] Typecheck and the full test suite pass
