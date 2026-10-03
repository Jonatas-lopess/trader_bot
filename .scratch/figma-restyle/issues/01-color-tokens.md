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

**Status:** ready-for-agent

- [ ] Every mapped role carries the Figma value above; no raw hex appears outside the tokens file
- [ ] The new roles exist and are usable as Tailwind utilities
- [ ] Each derived role has a one-line rationale in this ticket's comments, marked "derived, not in Figma"
- [ ] The contrast of `text-tertiary` (`#475569`) on `surface-base` (`#10141d`) is measured and written down. It is about 2.4:1, below AA for body text. Report it; do not change the Figma value
- [ ] The tokens-file header comment no longer claims Figma has zero variables
- [ ] Typecheck and the full test suite pass; the landing, catalog, login, legal and `/conta` pages render with no broken contrast or missing color

## Comments
