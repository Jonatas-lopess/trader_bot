# 06: Close the Figma reads the quota blocked

**What to build:** Three reads that need the Figma MCP quota (Starter plan, exhausted on 2026-10-02, monthly reset):

- `get_variable_defs` on `painel-cliente` (`86:1423`), never read.
- The exact font weight of each text style, to confirm or correct ticket 03.
- The owner's confirmation or redraw of every role derived in ticket 01.

**Blocked by:** the Figma quota reset (external, not a ticket).

**Status:** ready-for-human

- [x] `painel-cliente` Variables read and compared with the other frames
- [ ] Font weights match ticket 03, or the differences are written in its comments
- [ ] Each derived role from ticket 01 is confirmed or redrawn

## Comments

- 2026-10-06: Quota is back (Starter plan, View seat). `get_variable_defs` on `painel-cliente` (`86:1423`) answered with no rate-limit error. Compared against `src/styles/global.css`:
  - **Colors, match.** `action-primary` `#89b4fa`, `background-canvas` `#10141d`, `surface-default` `#171e29`, `surface-raised` `#1f2836`, `surface-emphasis` `#2b3c4e`, `border-default` `#1e293b`, `border-accent` `#89b4fa`, `text-primary` `#f1f5f9`, `text-secondary` `#94a3b8`, `text-inverse` `#10141d`, `feedback-success` `#4ead8a`, `surface-success` `#4ead8a1a`. All equal the values ticket 01 mapped. The frame does not use `border-strong`, `border-high-contrast` or `text-muted`; they stay confirmed only by the other frames.
  - **Derived roles, still unconfirmed.** The frame draws no `danger`, `accent`, hover, subtle or `surface-sunken`. Nothing here confirms or contradicts them; the owner's call (third checkbox) is still needed.
  - **Radius, match.** Figma `xs/sm/md/lg/xl` = 4/6/8/12/16, `circle` = 200; the code's shifted names (`2xs/xs/sm/md/lg`) hold the same pixels.
  - **Border width, match.** `border-width-1` = 1.
  - **Elevation/Card, match.** Drop shadow `#00000040`, offset (0, 8), blur 24, spread 0 equals `--shadow-card` (`0 8px 24px 0 rgb(0 0 0 / 0.25)`; `0x40` is 25%).
  - **Font families, match.** Heading Geist, body Manrope, mono Geist Mono.
  - **Font sizes, gap.** The frame uses 11, 12, 13, 14, 18, 36. The code scale has 12 (`caption`), 14 (`body-sm`), 18 (`body-lg`) and 36 (`display-phone`, by coincidence). Figma 11 and 13 have no token. No `.astro` file uses a one-off size; 13px only appears inline in `src/shared/email-template.ts` (email clients, outside the token scale). Decide whether `/conta` needs an 11px and a 13px step before adding either; this ticket does not add them.
  - **Spacing.** 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 80: all on Tailwind's 4px-based scale (6 = 1.5, 10 = 2.5). No change.
  - Still open: font weight per text style (`get_variable_defs` does not return it; needs `get_design_context` or `get_metadata`, which spends more quota) and the owner's confirmation of the derived roles.
