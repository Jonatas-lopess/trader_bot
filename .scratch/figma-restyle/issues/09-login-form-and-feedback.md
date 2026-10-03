# 09: `/login` field is nearly invisible; error reads as info

**What to build:** Two gaps on `/login`, both made visible by the new palette.

1. The e-mail input has `border-border-subtle` (`#1e293b`) and no background, on `surface-base` (`#10141d`): the border is 1.26:1 against the page (WCAG non-text contrast asks for 3:1). In the 1280 screenshot the field is almost not there. Figma's `border-high-contrast` (`#94a3b8`, 7.2:1) exists for this. A `bg-surface-raised` fill with `border-border-high-contrast` (or `border-border-strong`, still only 2.43:1) is the direction; `focus:border-border-accent focus:shadow-focus-ring focus:outline-none` as `src/components/license-card.astro` does is consistent (that component is the `/conta` agent's; copy the idea, don't edit it).
2. The `?error=1` message ("Esse link não é mais válido…") is `text-brand-primary`. With the primary now a soft blue, it looks like a link or an info line. The token `danger` (`#f38ba8`, 8:1 on the canvas; derived, not in Figma) is the error color. Same for `role="alert"`.

Figma node: no login frame exists (landing `6:5` only), so this is a code-and-screenshot finding, not a Figma diff.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The input boundary measures at least 3:1 against its surroundings, with a visible keyboard focus state
- [ ] The error message uses the danger color; the "sent" message keeps `text-secondary`
- [ ] The existing `/login` tests still pass (content strings unchanged)

## Comments
