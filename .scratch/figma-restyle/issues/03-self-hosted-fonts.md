# 03: Self-hosted Geist, Manrope and Geist Mono

**What to build:** The site renders in the Figma type families: Geist for headings, Manrope for body text, Geist Mono for mono data (keys, dates, badges). No third-party font request is made: the files are self-hosted as WOFF2 (`fontsource` packages, Latin subset only) with `font-display: swap`, and the first-paint weights are preloaded. The font tokens in the tokens file point at the new families, with the current system stack kept as the fallback.

Weights come from the PNG wireframes for now: regular, medium and bold for heading and body, regular for mono. Ticket 06 checks them against Figma.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Heading, body and mono tokens exist and the pages use them, with the system stack as fallback
- [ ] The built Worker serves the WOFF2 files from the same origin; the network panel shows no request to a font CDN
- [ ] Only the Latin subset and the weights in use are shipped; the size added to the build is recorded in this ticket's comments
- [ ] Above-the-fold weights are preloaded and `font-display: swap` is set, so text is never invisible while loading
- [ ] Typecheck and the full test suite pass; the page renders correctly with the fonts blocked

## Comments
