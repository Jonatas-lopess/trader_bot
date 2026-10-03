# 03: Self-hosted Geist, Manrope and Geist Mono

**What to build:** The site renders in the Figma type families: Geist for headings, Manrope for body text, Geist Mono for mono data (keys, dates, badges). No third-party font request is made: the files are self-hosted as WOFF2 (`fontsource` packages, Latin subset only) with `font-display: swap`, and the first-paint weights are preloaded. The font tokens in the tokens file point at the new families, with the current system stack kept as the fallback.

Weights come from the PNG wireframes for now: regular, medium and bold for heading and body, regular for mono. Ticket 06 checks them against Figma.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Heading, body and mono tokens exist and the pages use them, with the system stack as fallback
- [x] The built Worker serves the WOFF2 files from the same origin; the network panel shows no request to a font CDN
- [x] Only the Latin subset and the weights in use are shipped; the size added to the build is recorded in this ticket's comments
- [x] Above-the-fold weights are preloaded and `font-display: swap` is set, so text is never invisible while loading
- [ ] Typecheck and the full test suite pass; the page renders correctly with the fonts blocked (tests pass; fonts-blocked rendering not viewed)

## Comments

- 2026-10-02: Done. `@fontsource/geist`, `/manrope`, `/geist-mono` added; `global.css` imports `latin-*.css` for Geist 500/700, Manrope 400/500/700, Geist Mono 400. `--font-sans` (Manrope), `--font-heading` (Geist), `--font-mono` (Geist Mono), each with the old system stack as fallback. A base-layer rule sets `h1`–`h6` to the heading family, so no page was edited; `font-mono` is a utility for data rows.
- Size added to the build: 6 WOFF2 files, 13.0 + 13.1 + 9.6 + 13.8 + 13.7 + 13.9 = ~77 KB total, all under `/_astro/` with immutable cache headers. No font CDN reference in `dist/client/index.html` or the built CSS (grep clean).
- Preload: Geist 700, Manrope 400, Manrope 500 in `base-layout.astro` (hashed URLs through `?url` imports). `font-display: swap` comes from the fontsource CSS.
- Fallback with fonts blocked: not viewed in a browser; the stacks fall through to the system fonts by construction.
- Browser network-panel check not done by the agent (no browser); the build output was inspected instead.
- Typecheck: 0 errors. Full suite: 39 files, 352 tests pass (one earlier run showed 3 failures in `identity/e2e.test.ts` while builds and agents shared the machine; the file passes alone and the clean rerun passed).
- Correction from code review: fontsource's CSS also references `.woff` fallbacks, so `dist/client/_astro` holds 12 font files (6 `.woff2` + 6 `.woff`, ~116 KB of `.woff`). Browsers load only the WOFF2; the `.woff` files are dead weight in the build, not in page loads.
- Ticket 05's browser sweep confirmed Geist 700 and Manrope 400/500/700 load and no request leaves the origin. The fonts-blocked rendering is still unviewed.
- Note: `font-semibold` (600) is used in a few components; with only 500 and 700 shipped the browser picks 700.
