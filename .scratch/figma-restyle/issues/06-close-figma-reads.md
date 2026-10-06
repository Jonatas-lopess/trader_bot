# 06: Close the Figma reads the quota blocked

**What to build:** Three reads that need the Figma MCP quota (Starter plan, exhausted on 2026-10-02, monthly reset):

- `get_variable_defs` on `painel-cliente` (`86:1423`), never read.
- The exact font weight of each text style, to confirm or correct ticket 03.
- The owner's confirmation or redraw of every role derived in ticket 01.

**Blocked by:** the Figma quota reset (external, not a ticket).

**Status:** done

- [x] `painel-cliente` Variables read and compared with the other frames
- [x] Font weights match ticket 03, or the differences are written in its comments (the file has no text styles; nothing to compare, see comments)
- [x] Each derived role from ticket 01 is confirmed or redrawn

## Comments

- 2026-10-06: Quota is back (Starter plan, View seat). `get_variable_defs` on `painel-cliente` (`86:1423`) answered with no rate-limit error. Compared against `src/styles/global.css`:
  - **Colors, match.** `action-primary` `#89b4fa`, `background-canvas` `#10141d`, `surface-default` `#171e29`, `surface-raised` `#1f2836`, `surface-emphasis` `#2b3c4e`, `border-default` `#1e293b`, `border-accent` `#89b4fa`, `text-primary` `#f1f5f9`, `text-secondary` `#94a3b8`, `text-inverse` `#10141d`, `feedback-success` `#4ead8a`, `surface-success` `#4ead8a1a`. All equal the values ticket 01 mapped. The frame does not use `border-strong`, `border-high-contrast` or `text-muted`; they stay confirmed only by the other frames.
  - **Derived roles.** The frame draws no `danger`, `accent`, hover, subtle or `surface-sunken`. Nothing here confirms or contradicts them; the owner confirmed them (see the closing comment below).
  - **Radius, match.** Figma `xs/sm/md/lg/xl` = 4/6/8/12/16, `circle` = 200; the code's shifted names (`2xs/xs/sm/md/lg`) hold the same pixels.
  - **Border width, match.** `border-width-1` = 1.
  - **Elevation/Card, match.** Drop shadow `#00000040`, offset (0, 8), blur 24, spread 0 equals `--shadow-card` (`0 8px 24px 0 rgb(0 0 0 / 0.25)`; `0x40` is 25%).
  - **Font families, match.** Heading Geist, body Manrope, mono Geist Mono.
  - **Font sizes, gap.** The frame uses 11, 12, 13, 14, 18, 36. The code scale has 12 (`caption`), 14 (`body-sm`), 18 (`body-lg`) and 36 (`display-phone`, by coincidence). Figma 11 and 13 have no token. No `.astro` file uses a one-off size; 13px only appears inline in `src/shared/email-template.ts` (email clients, outside the token scale). Decide whether `/conta` needs an 11px and a 13px step before adding either; this ticket does not add them.
  - **Spacing.** 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 80: all on Tailwind's 4px-based scale (6 = 1.5, 10 = 2.5). No change.
  - Same day, `get_design_context` on `86:1423` (for the weights) failed: "You've reached the Figma MCP tool call limit on the Starter plan". The quota is spent again after the Variables read and `whoami`. Moot: the file has no text styles.
- 2026-10-06: Closed by the owner. Derived roles confirmed as they stand in `global.css` (`surface-sunken`, `brand-primary-hover`, `brand-primary-subtle`, `danger`, `danger-subtle`, `accent`). The owner found no text styles in the Trader file, so there are no per-style weights to read: ticket 03's weights (Geist 500/700, Manrope 400/500/700, Geist Mono 400) stay as taken from the wireframes. The `get_design_context` read that failed on quota is no longer needed.
- Not closed by this ticket: ticket 05's per-node Figma comparison (landing and catalog against `6:5`) and ticket 10's check that Figma draws the wordmark and prices in Geist. Both still need a Figma read after the next quota reset; they keep their own open boxes.
