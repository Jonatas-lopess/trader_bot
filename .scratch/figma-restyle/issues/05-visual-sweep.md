# 05: Visual sweep of the other pages after the port

**What to build:** After the palette, shape tokens and fonts land, the landing, catalog, login and legal pages are compared against the Figma landing frame (`6:5`) and the new tokens, and the gaps are written down. Findings only: this ticket fixes nothing. Spacing differences the owner already accepts ("minor differences from the beginning") are not findings; layout or color gaps that look wrong are.

Each real gap becomes its own ticket in this effort, with the page and the Figma node.

**Blocked by:** 01, 02, 03.

**Status:** done

- [x] Every public page was viewed in the browser at desktop and phone width (see comments: `/checkout/confirmacao` only in its no-`ref` state)
- [ ] Each finding names the page, the Figma node it differs from, and what differs (pages and what differs: yes; Figma node: **not done**, no Figma frame could be read, see comments. Left open until ticket 06 reads)
- [x] Each real gap has a follow-up ticket, or the owner chose to accept it (07 to 10; owner has not yet accepted or rejected any)
- [x] No page or token was edited by this ticket

## Comments

### Sweep, 2026-10-02

**Method, honestly.** Figma: one `get_screenshot` call on `6:5` returned the Starter-plan tool-call limit error; no further Figma call was made. So **nothing here is compared pixel-for-pixel against Figma**; the Figma-differs-from column is "not read" and the layout/color judgments below are against the new tokens and the wireframe conventions only. Viewed: `pnpm build && pnpm preview`, Playwright 1.63 headless Chromium, full-page screenshots at 1280 and 390 of `/`, `/catalog`, `/login`, `/login?sent=1&error=1`, `/privacidade`, `/termos-de-uso`, `/checkout/confirmacao` (no `ref`). Not viewed: `/checkout/confirmacao?ref=...` returns 500 in the local preview (no database binding), so the `pending`, `active` and retry-link states of that page were **code-read only**. `/conta` was excluded (ticket 04). Contrast numbers are computed (WCAG 2.x), not from the browser. Hover and mobile-menu-open states were not viewed.

**Findings (each has a ticket):**

- 07: `text-tertiary` on meaningful text. 2.43:1 on base, 2.21:1 on raised, 1.96:1 on overlay. Footer legal notice and copyright (overlay), catalog regulatory note, robot-card labels and captions. Viewed: the AVISO LEGAL is barely readable.
- 08: 390px layout. Fixed 80px gutter plus Geist at 3.5rem pushes the hero headline to the viewport edge (`scrollWidth` 392 on 390); the annual row on a catalog card wraps `R$ 497`.
- 09: `/login` input border `border-subtle` is 1.26:1 on the canvas, field almost invisible; error message in `brand-primary` reads as a link.
- 10: `text-heading-*` on non-heading elements (header wordmark, footer brand, prices) renders Manrope, not Geist.

**Checked and fine (code plus viewed):**

- Brand fill with `text-on-brand` (dark `#10141d` on `#89b4fa`): 8.75:1, hover `#7ba2e1` 7.1:1. All buttons, the header CTA, the play disc: legible, no leftover white-on-brand. No `text-white`, `bg-white`, raw hex or `accent`/violet usage in the public pages or components (`accent` is only listed on `/dev/tokens`).
- Brand text on `brand-primary-subtle` badges (hero, section badges, "Economize 20%", step numbers): 6.3 to 7.1:1.
- `text-secondary` on all surfaces: 4.4 to 7.5:1 (lowest on `surface-emphasis`, which no public page uses). Success 6.1:1, danger 7.2:1 on raised.
- Dashed border: only the hero visual placeholder (`border-2 border-dashed border-border-strong`); intentional placeholder, 22px radius renders well. Not a finding.
- Gradient: only the video placeholder (`from-surface-raised to-surface-sunken`), no accent in it; looks fine.
- Radius 22px (was 24px) on hero placeholder and video frame: no visible problem. Card shadow and the carousel highlight glow render; the glow is much fainter now (alpha 0.12 per Figma), the highlighted card is carried by its brand border and the 1.05 scale. Accepted by Figma geometry; flag only if the owner wants it stronger.
- Fonts: Geist 700, Manrope 400/500/700 loaded; `h1`-`h3` compute to Geist, body to Manrope; zero requests outside `localhost` on every page at both widths.
- Catalog carousel, legal pages, confirmation page (no-`ref`): no layout or color gap beyond 07 and 08.

**Not found / not verifiable here:** hover states, the open mobile menu, the confirmation page's other states, and every Figma-side comparison. Ticket 06 or a later pass should repeat the landing and catalog comparison against `6:5` when the quota resets; if it finds new gaps they get tickets numbered after 10.
