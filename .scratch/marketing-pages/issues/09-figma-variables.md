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

**Status:** done

- [x] Variables created from the frames' own current values, not from `global.css` (created by the owner in Figma, not by an agent)
- [ ] Every created Variable's value is byte-identical to the raw value it replaced
- [ ] Before/after screenshot comparison of both frames shows zero visual difference
- [x] `get_variable_defs` on both frames returns a non-empty map (2026-10-02: `6:5` 54 variables, `6:217` 49)
- [ ] Only values matching ticket 02's named recurring primitives are variablized — no one-off values turned into Variables
- [x] Any disagreement found between the extracted Figma values and `global.css` is written up, not silently fixed on either side (see below)

## Comments

- 2026-09-25: Attempted implementation. Blocked before any read/write — Figma MCP account is Starter plan, View seat, 20 tool calls/month, quota already exhausted (`whoami` still works, all read/write calls fail with the monthly limit error). Resets are monthly, not daily, so this isn't a short retry. No frame values read, no Variables created, `global.css` untouched. Needs a Pro/Org/Enterprise plan with a Dev or Full seat before this ticket is actionable again.

- 2026-10-02: Owner generated the Variables in Figma by hand (collection prefix `--rt-`), so no agent write was needed. Agent read them back with `get_variable_defs`:
  `6:5` and `6:217` return non-empty maps, and so does `86:1602` (estados-licenca, 28 variables, same names and values). `86:1423` (painel-cliente) was not read: the Figma monthly call quota ran out again. Not verified by the agent, taken on the owner's word: byte-identical rebinding, the before/after screenshot diff, and that no one-off value became a Variable.
  Two new frames now exist in the file, both wireframes of the customer area (`/conta`): `painel-cliente` (`86:1423`) and `estados-licenca` (`86:1602`). PNG exports sit in the repo root.

## Figma vs `global.css` (informational, nothing edited on either side)

The disagreement is the whole palette, not a few values. Figma looks like a different system (Catppuccin-style blues, Geist/Manrope), and `global.css` still carries the hand-authored palette from ticket 02.

**Color**

| Figma `--rt-color-*` | Figma | `global.css` nearest | `global.css` |
| --- | --- | --- | --- |
| `background-canvas` | `#10141d` | `surface-base` | `#0a0e16` |
| `surface-default` | `#171e29` | `surface-raised` | `#121826` |
| `surface-raised` | `#1f2836` | `surface-overlay` | `#1a2233` |
| `surface-emphasis` | `#2b3c4e` | none | |
| `surface-success` | `#4ead8a1a` | `success-subtle` | `#123321` |
| `border-default` | `#1e293b` | `border-subtle` | `#212b3d` |
| `border-strong` | `#475569` | `border-strong` | `#303d57` |
| `border-high-contrast` | `#94a3b8` | none | |
| `border-accent` | `#89b4fa` | none | |
| `text-primary` | `#f1f5f9` | `text-primary` | `#f4f6fa` |
| `text-secondary` | `#94a3b8` | `text-secondary` | `#99a3b8` |
| `text-muted` | `#475569` | `text-tertiary` | `#5e697f` |
| `text-inverse` | `#10141d` | `text-on-brand` | `#ffffff` (opposite polarity) |
| `action-primary` | `#89b4fa` | `brand-primary` | `#3d7cff` |
| `feedback-success` | `#4ead8a` | `success` | `#22c55e` |

Only in `global.css`: `brand-primary-hover`, `brand-primary-subtle`, `accent` (violet), `danger`, `danger-subtle`, `surface-sunken`. No hover state, danger or violet accent in Figma. `estados-licenca` draws expired/suspended without a danger color.

**Type.** Figma families: Geist (heading), Manrope (body), Geist Mono (mono). `global.css` has one system sans stack and no mono. Figma sizes: 11, 12, 13, 14, 15, 16, 18, 32, 36, 44, 52. `global.css` sizes: 12, 14, 16, 18, 24, 32, 44, 56. Matching: 12, 14, 16, 18, 32, 44. Figma-only: 11, 13, 15, 36, 52. `global.css`-only: 24, 56. Line-heights are not Variables in Figma.

**Radius.** Figma: 0, 4, 6, 8, 12, 16, 22, 40, 99 (pill), 200 (circle). `global.css`: 8, 12, 16, 24. Names are shifted by one: Figma `md` = 8 where `global.css` `sm` = 8, and Figma `lg` = 12 where `global.css` `md` = 12. 24 has no Figma value.

**Spacing and layout.** Figma `--rt-space-*`: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120. Layout primitives that match: gutter 80, badge px 14, badge h 28, card padding 32/40, button 48. No Figma value: button 44, card widths 302 and 410.67, content row 1280. `global.css` has no general spacing scale.

**Border width and effects.** Figma has `border-width-1/2`; `global.css` has none. Figma effects: `Elevation/Card` (0 8 24, `#00000040`), `Elevation/Accent` (0 12 32, `#89B4FA1F`). `global.css` has `shadow-raised`, `shadow-card`, `shadow-glow-brand`, `shadow-focus-ring`; none match exactly.

**Stale comment.** `global.css` lines 9-10 still say "The Figma file defines zero variables". Not true now. Left alone, per this ticket's rule.

**Follow-up.** Nothing resolves these disagreements yet. Aligning `global.css` to the Figma palette is a restyle of every page already built, so it needs its own decision.
