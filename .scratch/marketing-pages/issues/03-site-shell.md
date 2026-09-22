# 03: Site shell — layout, header, footer, metadata

**What to build:** The frame every page sits inside. A visitor loading any route gets a correct document — `lang="pt-BR"`, title, description, Open Graph tags, favicon — wrapped in the header and footer from the Figma frames, with analytics recording the visit.

Header (`6:6`, identical on both frames as `6:218`): brand lockup, nav — Como funciona / Planos / FAQ / Login — and a "Comprar agora" button.

Footer (`6:191`, repeated as `6:344`): brand column with tagline, "Links Úteis" column (Como funciona, Planos & Preços, FAQ), "Suporte & Termos" column (Termos de uso, Política de privacidade, Contato), the AVISO LEGAL risk disclaimer, copyright line.

Two link groups have no destination in this scope, and that is a decision, not an oversight to paper over. Termos de uso and Política de privacidade were dropped from this effort; the customer area behind Login and the Contato route are not in 0.1's marketing slice. Render them as inert (not anchors to `#`), and record the dead set in one place so the gap is visible rather than discovered in QA.

The AVISO LEGAL text is the one piece of copy in the file that reduces legal exposure rather than adding to it. Ship it verbatim on every page.

Content is hardcoded in typed content files, not a CMS and not inline strings in markup (PLANNING.md §2). This ticket sets that convention; every later section follows it. Analytics is Cloudflare Web Analytics — cookieless, no consent banner (§3).

**Figma:** header `6:6`, footer `6:191` — https://www.figma.com/design/r2pQyOPGfUNV4Tsh3br2wv/Trader?node-id=6-6

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Base Astro layout applying the tokens from 02
- [ ] Header and footer match the frames at 1440px and collapse cleanly at mobile widths
- [ ] Header nav has a working mobile treatment (no mobile artboard exists — derive it)
- [ ] AVISO LEGAL disclaimer renders verbatim in the footer
- [ ] Links with no destination render inert, and the dead set is listed in one greppable place
- [ ] `lang="pt-BR"`, per-page title/description, Open Graph and Twitter card tags
- [ ] Typed content-file convention established and documented in one place
- [ ] Cloudflare Web Analytics beacon present, no cookie banner
