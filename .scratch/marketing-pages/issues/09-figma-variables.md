# 09: Extract the Figma frames' own raw values into Variables

**What to build:** Real Figma Variable collections in the Trader file, generated from the frames' *own current raw values* — not from `global.css`. The frame stays the source of truth; this ticket only adds a named-Variable layer of indirection on top of values that are already drawn, so the project can keep reading Figma via `get_variable_defs` instead of a human re-eyeballing frames by hand. It must not change how either frame looks.

Ticket 02 confirmed the file defines zero Variables (`get_variable_defs` on `6:5` returns `{}`, re-confirmed 2026-09-25) — `global.css` was hand-authored by reading the frames, and in a couple of places (layout primitives, the type scale) it built a coherent *scale* out of the concrete measurements rather than keeping every value pixel-for-pixel identical to the frame. That makes `global.css` the wrong source for this ticket: writing its values back into Figma could snap a layer to a token that isn't quite what's currently drawn, which is a visual override of the design, not an extraction from it.

Direction, explicitly: **Figma frame → Variable → (later, separately) re-checked against `global.css`.** Never `global.css` → Figma.

Scope:

- Read each frame's current values directly (`get_design_context` / `get_metadata`, not `global.css`) — color fills, text sizes/line-heights, the recurring spacing/sizing primitives listed in ticket 02, corner radii.
- For each distinct value found, create one Figma Variable holding that exact value, in the appropriate collection (Color / Number / Type as the file's plan tier supports).
- Rebind the layer(s) currently holding that raw value to the new Variable, in place. The bound value must be byte-identical to what was there before — this is a refactor of the file's structure, not an edit of its design.
- Do not create a Variable for a value that appears once and isn't one of ticket 02's named tokens — only variablize what's actually reused, to avoid inventing a design-system opinion the frame doesn't already express.

Shadows: Figma effect styles have no direct Variable equivalent for `global.css`'s relative-color glow — leave out of scope.

**Verification:**
- Screenshot or `get_screenshot` diff of both frames before/after shows no visual change.
- `get_variable_defs` on `6:5` and `6:217` now returns a non-empty map.
- Separately, *after* extraction, compare the new Figma values against `global.css` and note any place they disagree — informational only, this ticket does not resolve disagreements by editing either side.

**Figma:** landing `6:5`, plans `6:217` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-5

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Variables created from the frames' own current values, not from `global.css`
- [ ] Every created Variable's value is byte-identical to the raw value it replaced
- [ ] Before/after screenshot comparison of both frames shows zero visual difference
- [ ] `get_variable_defs` on both frames returns a non-empty map
- [ ] Only values matching ticket 02's named recurring primitives are variablized — no one-off values turned into Variables
- [ ] Any disagreement found between the extracted Figma values and `global.css` is written up, not silently fixed on either side
