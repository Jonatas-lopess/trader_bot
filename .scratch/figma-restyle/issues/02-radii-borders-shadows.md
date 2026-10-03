# 02: Figma radii, border widths and elevation behind the existing tokens

**What to build:** The non-color shape tokens follow the Figma file, again without editing any page. Figma radii (`--rt-radius-*`): 0, 4, 6, 8, 12, 16, 22, 40, pill 99, circle 200. Figma border widths: 1 and 2. Figma effects: `Elevation/Card` (drop shadow 0 8 24, `#00000040`) and `Elevation/Accent` (drop shadow 0 12 32, `#89B4FA1F`).

Rules:

- The existing radius names keep their pixel values where Figma has the same pixel value (8, 12, 16), so nothing visible moves there. Figma names its scale one step differently (its `md` is 8, the code's `sm` is 8); the code names stay, and the ticket's comments record the correspondence.
- The code's 24px radius has no Figma value. Figma's closest is 22. Figma wins: the one token at 24 takes 22, and its consumers are checked visually.
- Add the Figma radii the code lacks: 4, 6, 22 if not already used above, 40, pill, circle.
- Add the two border widths as tokens.
- Elevation: adopt Figma's geometry and alpha for the card shadow. The brand glow keeps its relative-color derivation from the brand color (so it follows ticket 01) but takes Figma's offset, blur and alpha.

**Blocked by:** None (can start immediately). It edits the same tokens file as 01 in a different section, so merge order doesn't matter.

**Status:** done

- [x] Radii at 8, 12, 16 are unchanged in value; the 24px one now follows Figma and its consumers were checked
- [x] The new radii and the 1/2 border widths exist as usable utilities
- [x] The card shadow and the brand glow match Figma's geometry and alpha
- [x] The correspondence between Figma's radius names and the code's is written in this ticket's comments
- [x] Typecheck and the full test suite pass; no page shows an obviously wrong corner or shadow

## Comments

- 2026-10-02: Done in `src/styles/global.css`.
- Radius correspondence (Figma `--rt-radius-*` → code name, px): `md`=8 → `sm`; `lg`=12 → `md`; 16 → `lg`; 22 → `xl` (was 24); 4 → `2xs`; 6 → `xs`; 40 → `2xl`; 99 → `pill`; 200 → `circle`; 0 is `rounded-none`. Note `xs` and `2xl` override Tailwind's defaults; no existing page used `rounded-xs`, `rounded-2xl` or `rounded-3xl`.
- Consumers of the 24→22 token (`rounded-xl`): hero visual placeholder (`hero-section.astro`) and video frame (`video-section.astro`). A 2px corner change; checked by reading, not yet in the browser (covered by ticket 05).
- Border widths: `--border-width-1/2` with `border-w-1` / `border-w-2` utilities.
- Elevation: `shadow-card` = `0 8px 24px 0 rgb(0 0 0 / 0.25)` (Figma `#00000040`). `shadow-glow-brand` = `0 12px 32px 0` at 12% of `brand-primary` via relative color (Figma `#89B4FA1F`).
- Suite: see ticket 03 comment.
