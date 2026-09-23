# 02: Design tokens from the Figma frames

**What to build:** The site's visual vocabulary, expressed as Tailwind v4 `@theme` tokens, plus an internal preview page that renders every token so a human can compare it against Figma side by side.

The file defines zero variables — confirmed, `get_variable_defs` on the landing frame returns `{}`. Tokens are authored by hand by reading the two 1440px frames: color ramp, type scale, spacing scale, radii, shadows. Name tokens after their role, not their value.

Recurring primitives visible across both frames, worth tokenising rather than re-deriving per section: the 80px page gutter, the 1280px content row, the `section-badge` pill (28px tall, 14px inset), the 44px/48px button heights, the 32px/40px card padding, and the 302 / 410.67px card widths on a 1280px row.

Icons in the frames are Lucide names (`brain-cog`, `shield`, `check-check`, `x-circle`, `credit-card`, `download-cloud`, `database`, `chart-spline`, `play`, `bot`, `toggle-right`, `shield-alert`). Pick the icon approach here so no later ticket has to.

The preview page is what makes this ticket verifiable on its own. It lives outside public navigation.

**Figma:** landing `6:5`, plans `6:217` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-5

**Blocked by:** 01

**Status:** done

- [ ] Tailwind v4 installed, tokens declared in an `@theme` block
- [ ] Color, type scale, spacing, radius and shadow tokens cover everything both frames use
- [ ] Layout primitives above exist as tokens or shared classes, not per-section magic numbers
- [ ] Icon strategy chosen and one icon rendered as proof
- [ ] No raw hex values or one-off sizes outside the token declaration
- [ ] Internal token-preview route renders every token with its name, excluded from sitemap and navigation
