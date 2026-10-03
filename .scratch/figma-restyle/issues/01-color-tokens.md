# 01: Figma colors behind the existing role names

**What to build:** Every page repaints in the Figma palette by changing token values only. Today's role names stay (`brand-primary`, `surface-raised`, …), so no page or component is edited. Figma is the source: the values come from the Variables in the Trader file, which ticket `marketing-pages/09` read back from the landing, plans and estados-licenca frames. The full Figma-vs-code table is in that ticket's comments.

Role mapping (Figma `--rt-color-*` into the existing role):

| Existing role | Figma role | Value |
| --- | --- | --- |
| `surface-base` | `background-canvas` | `#10141d` |
| `surface-raised` | `surface-default` | `#171e29` |
| `surface-overlay` | `surface-raised` | `#1f2836` |
| `border-subtle` | `border-default` | `#1e293b` |
| `border-strong` | `border-strong` | `#475569` |
| `text-primary` | `text-primary` | `#f1f5f9` |
| `text-secondary` | `text-secondary` | `#94a3b8` |
| `text-tertiary` | `text-muted` | `#475569` |
| `text-on-brand` | `text-inverse` | `#10141d` (was white; the new primary is light) |
| `brand-primary` | `action-primary` | `#89b4fa` |
| `success` | `feedback-success` | `#4ead8a` |
| `success-subtle` | `surface-success` | `#4ead8a1a` |

New roles Figma has and the code lacks: `surface-emphasis` `#2b3c4e`, `border-high-contrast` `#94a3b8`, `border-accent` `#89b4fa`.

Roles the code has and Figma lacks, derived from the new palette and recorded in this ticket as "derived, not in Figma" for the owner to confirm or redraw (ticket 06): `surface-sunken`, `brand-primary-hover`, `brand-primary-subtle`, `danger`, `danger-subtle`, `accent`. Derive, don't invent: each from an existing Figma value (hover as a step off `action-primary`, subtle as a low-alpha of its parent, `surface-sunken` darker than the canvas). `danger` and `accent` have no Figma counterpart at all, so keep them tonally in family and say so.

Also fix the now-false comment at the top of the tokens file ("the Figma file defines zero variables").

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Every mapped role carries the Figma value above; no raw hex appears outside the tokens file
- [x] The new roles exist and are usable as Tailwind utilities
- [x] Each derived role has a one-line rationale in this ticket's comments, marked "derived, not in Figma"
- [x] The contrast of `text-tertiary` (`#475569`) on `surface-base` (`#10141d`) is measured and written down. It is about 2.4:1, below AA for body text. Report it; do not change the Figma value
- [x] The tokens-file header comment no longer claims Figma has zero variables
- [ ] Typecheck and the full test suite pass; the landing, catalog, login, legal and `/conta` pages render with no broken contrast or missing color

## Comments

- 2026-10-02: Done in `src/styles/global.css`. Mapped roles carry the Figma values; new roles `surface-emphasis`, `border-high-contrast`, `border-accent` added. No raw hex outside the tokens file (grep of `src/**/*.astro` clean). Header comment rewritten.
- Derived, not in Figma (for owner confirmation, ticket 06):
  - `surface-sunken` `#0b0e15`: canvas darkened to roughly 70% lightness.
  - `brand-primary-hover` `#7ba2e1`: `action-primary` mixed 10% toward black (a light primary darkens on hover).
  - `brand-primary-subtle` `#89b4fa1f`: `action-primary` at 12% alpha.
  - `danger` `#f38ba8` and `accent` `#cba6f7`: no Figma counterpart; red and violet in the same pastel family as `action-primary`.
  - `danger-subtle` `#f38ba81a`: `danger` at 10% alpha, matching `surface-success`.
- Contrast measured (WCAG): `text-tertiary` `#475569` on `surface-base` `#10141d` = 2.43:1; on `surface-raised` `#171e29` = 2.21:1. Below AA (4.5:1) for body text. Used for footer legal text, robot-card captions and labels, and placeholders (`text-caption`/`text-body-sm`). Figma value kept; reported only. Other pairs: `text-secondary` on base 7.19:1; `text-on-brand` on `brand-primary` 8.75:1, on hover 7.10:1.
- Typecheck and the full suite pass (39 files, 352 tests; see ticket 03). The "no broken contrast" half is not met: the sweep (ticket 05) found `text-tertiary` fine print at 1.96–2.43:1 (follow-up 07) and a 1.26:1 `/login` field border (follow-up 09). Box left open until those close.
