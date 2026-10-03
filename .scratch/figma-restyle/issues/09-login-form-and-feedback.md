# 09: `/login` field is nearly invisible; error reads as info

**What to build:** Two gaps on `/login`, both made visible by the new palette.

1. The e-mail input has `border-border-subtle` (`#1e293b`) and no background, on `surface-base` (`#10141d`): the border is 1.26:1 against the page (WCAG non-text contrast asks for 3:1). In the 1280 screenshot the field is almost not there. Figma's `border-high-contrast` (`#94a3b8`, 7.2:1) exists for this. A `bg-surface-raised` fill with `border-border-high-contrast` (or `border-border-strong`, still only 2.43:1) is the direction; `focus:border-border-accent focus:shadow-focus-ring focus:outline-none` as `src/components/license-card.astro` does is consistent (that component is the `/conta` agent's; copy the idea, don't edit it).
2. The `?error=1` message ("Esse link não é mais válido…") is `text-brand-primary`. With the primary now a soft blue, it looks like a link or an info line. The token `danger` (`#f38ba8`, 8:1 on the canvas; derived, not in Figma) is the error color. Same for `role="alert"`.

Figma node: no login frame exists (landing `6:5` only), so this is a code-and-screenshot finding, not a Figma diff.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The input boundary measures at least 3:1 against its surroundings, with a visible keyboard focus state
- [x] The error message uses the danger color; the "sent" message keeps `text-secondary`
- [x] The existing `/login` tests still pass (content strings unchanged)

## Comments

### Built, 2026-10-02

`src/pages/login.astro` only; `src/content/login.ts` untouched (copy unchanged). Input: `border-w-1 border-border-high-contrast bg-surface-raised` plus `focus:border-border-accent focus:shadow-focus-ring focus:outline-none` (the `license-card.astro` idea, not edited). Error `<p role="alert">`: `text-danger` (was `text-brand-primary`). "Sent" message stays `text-secondary`. Form action, `name="email"`, `required` and the rest unchanged.

Verification. **Viewed** (Playwright 1.63 headless Chromium against `pnpm build` + `astro preview`, screenshots at 1280 and 390): `/login`, `/login?sent=1&error=1`, the focused input at 390. The field is clearly visible with a light-grey boundary on a raised fill; the error is pink; the sent line is grey; the focus state shows the accent border and the 3px ring. Computed in the browser: unfocused border `#94a3b8`-class token (7.2:1 on the canvas by the ticket's numbers, computed not measured), fill `rgb(23,30,41)`, focus border `rgb(137,180,250)` with the ring `0.5` alpha shadow, error color `rgb(243,139,168)` (danger). **Not viewed:** the unfocused input at 390 on its own, hover. **Tests:** `pnpm typecheck` 0 errors, `pnpm build` ok; `src/modules/identity` suites pass (customers, magic-link, session, normalize-email). `e2e.test.ts` failed once when run together with the others (while a concurrent build/preview from another agent was running) and passed 4/4 when rerun alone; no test asserts on login markup or classes. Also extended `/dev/tokens` for tickets 01/02 (not part of this ticket's criteria).
