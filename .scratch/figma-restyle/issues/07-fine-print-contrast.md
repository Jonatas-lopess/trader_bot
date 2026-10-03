# 07: Fine print and labels unreadable on `text-tertiary`

**What to build:** On the public pages, text that must be read (the legal notice, the regulatory note, form-like labels and captions) uses `text-text-tertiary`, which is now Figma's `text-muted` `#475569`. Measured (WCAG 2.x): 2.43:1 on `surface-base`, 2.21:1 on `surface-raised`, 1.96:1 on `surface-overlay` (the footer), against 4.5:1 required for small text. The legal copy is effectively illegible. The token value stays (the Figma value is not changed; ticket 01). The consumers change: text that carries meaning moves to `text-text-secondary` (`#94a3b8`, 4.4:1 to 7.5:1 on every surface), and `text-tertiary` stays for placeholders and disabled items only.

Found by ticket 05 (code reading plus viewing `/`, `/catalog` at 1280 and 390). Figma node for the footer and landing text: `6:5` (not compared: Figma quota exhausted, see ticket 05 comments).

Consumers to move to `text-secondary` (read as content):

- `src/components/site-footer.astro`: AVISO LEGAL paragraph (caption, on `surface-overlay`, 1.96:1) and the copyright line
- `src/pages/catalog.astro`: `regulatoryNote` (caption, on `surface-base`, 2.43:1)
- `src/components/robot-card.astro`: the `Estratégia:` / `Corretoras compatíveis:` labels (body-sm, on `surface-raised`), the price captions (caption) and the per-offer captions

To leave on `text-tertiary` (placeholder or disabled by intent): the footer "Contato" dead link, the hero visual placeholder label, the video "em produção" label. Ask the owner whether the placeholders should follow once the real assets land; they disappear then.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] No `text-tertiary` remains on text that carries meaning on `/`, `/catalog`, `/login`, `/privacidade`, `/termos-de-uso`, `/checkout/confirmacao`
- [ ] The legal notice and regulatory note measure at least 4.5:1 on their background
- [ ] Hierarchy is still visible (labels stay lighter than values, e.g. via size or weight, not via the muted color)
- [ ] The token value of `text-tertiary` is unchanged

## Comments
