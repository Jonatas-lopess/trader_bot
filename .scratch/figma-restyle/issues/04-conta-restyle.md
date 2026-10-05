# 04: `/conta` restyled from the wireframes

**Scope revision (owner review, 2026-10-05).** The first build took only the wireframes' colors, fonts, badge and card, and kept the generic marketing shell and a single column. The owner rejected it as "nothing like the wireframe". The page now also takes the **layout**: an app shell (own header with "Área do cliente", Sair with icon, tab bar, slim footer), the "Meus produtos" title with an active-Licenças pill, a two-column body, lean cards in a grid and a sidebar with a support card and the backend note. Still skipped because there is no backend or product behind them: avatar and name, upgrade card, invoice table, key box with Copiar, and the download, renew and checklist buttons. The support button has no destination (`deadLinks.suporte`).

**What to build:** The customer area takes the visual language of the `painel-cliente` and `estados-licenca` wireframes (Figma `86:1423` and `86:1602`; PNG exports: [painel-cliente](../wireframes/painel-cliente.png), [estados-licenca](../wireframes/estados-licenca.png)) with no change to content or behavior. The six Licença states (`none`, `awaiting_account`, `preparing`, `active`, `expired`, `revoked`), the Corretora account form, the Assinatura cancel and the email-only download path all work exactly as today.

Carry over from the wireframes:

- The product card, with a status badge carrying a Lucide icon per Licença state.
- Mono-font data rows (Licença, Assinatura, Conta na Corretora) and the Oferta in the mono subtitle under the Robô name.
- The static "liberação só após confirmação do backend" note panel.
- The "Área do cliente" label in the header, next to the existing Sair.

The states the wireframes do not draw (`awaiting_account`, `preparing`, `active`, `revoked`, plus the Corretora form and its notice banners) are derived from the same card pattern. The owner reviews them in the browser.

Skip, on purpose:

- The avatar and name, upgrade card and invoice table, and the tabs other than "Meus produtos".
- The Renovar licença, Baixar novamente and Download bloqueado buttons, and the checklist link. There is no download on `/conta`; it stays email-only in 0.1.
- The near-expiry state ("Vence em 5 dias") and chargeback-specific copy: deferred (see `.scratch/backlog.md`).

The page heading is now "Meus produtos" (scope revision above); the domain term stays Robô. Copy goes in the typed content files, never inline in markup; anything `launchBlocking` stays marked.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-human

- [x] Each of the six Licença states renders as a card in the wireframe style, with an icon badge and a mono data row
- [x] The Corretora form, its notices and the cancel control appear in the new style and behave as before
- [x] The backend-confirmation note panel and the "Área do cliente" header label are present
- [x] None of the skipped elements appear
- [x] No behavior change: the existing content and `/conta` tests pass unchanged; any new copy lives in the content files
- [ ] The owner has viewed every state in the browser (`astro dev`) after the scope revision and signed off or listed changes
- [x] Typecheck and the full test suite pass

## Comments

**Implementation (agent).** Built `src/components/license-card.astro` (icon tile, Lucide status badge, mono Licença/Assinatura data row, Corretora banner and form, rejected notice, cancel form; all `data-*` attributes, form actions and field names unchanged) and rewired `src/pages/conta.astro` to render it per Licença. The page header now holds the "Área do cliente" mono label above "Sua conta" with Sair on the same row (moved from the page bottom; `site-header.astro` untouched). The static backend-confirmation note panel closes the page. New copy lives in `src/content/conta.ts`: `licenseBadges` (label, icon key, tone per Licença state), `corretoraNoticeTones`, `backendNoteHeading`/`backendNoteBody`, `customerAreaLabel`. New tests in `src/content/conta-badges.test.ts`; existing `conta.test.ts` and `account-page.test.ts` pass unchanged. `pnpm typecheck` and `pnpm build` are clean; the full suite is left to the orchestrator and the browser sign-off to the owner.

Derived-state decisions (owner to review in the browser):
- Badge tones: `active` success; `revoked` danger (not drawn; owner to confirm); `expired` neutral because `estados-licenca` draws it neutral (fixed after code review); `none`, `awaiting_account`, `preparing` neutral (brand-blue on emphasis surface). Labels: Pagamento pendente, Conta pendente, Em preparo, Licença ativa, Licença expirada, Licença revogada. Icons: hourglass, key-round, cog, shield-check, circle-x, shield-alert.
- The wireframe's "Pagamento confirmado pelo backend" / "Sem renovação confirmada" sub-lines were not added (they would be new claims); the data row is the existing Licença and Assinatura values in Geist Mono.
- Corretora banner is an inset panel (`surface-sunken`, `border-accent`) inside the card; the input uses the strong border and focus ring. Corretora notice banner: success tone for `saved`, danger for the three error notices. The rejected-payment notice is an emphasis-surface panel.
- The disabled-action style has no use on `/conta` once "Download bloqueado" is skipped, so it was not built.
- The backend note copy is wrapped in `launchBlocking` (adapted from the Figma frame, which mentions Pix/boleto and suspension; owner approval pending).
- Card title is "Licença" (the Robô name stays as the group `h2`); the Corretora banner heading dropped from `h3` to `h4` under it.

**Scope revision (agent, 2026-10-05).** Added `src/components/account-header.astro` and `account-footer.astro`, selected by a `shell="account"` prop on `base-layout.astro`. `license-card.astro` is now a lean card (icon tile, Robô name, `OFERTA <X>` mono subtitle, badge, three-item data row), laid out in a two-column grid beside a sidebar; the Corretora-form card spans the full row. `AccountLicense` gained `offer` and `corretoraAccount` (one extra D1 read in `resolveAccountView`). Heading, subheading, offer labels, the support card copy (`launchBlocking`) and the active-count pill live in `src/content/conta.ts`. `deadLinks.suporte` joins the dead-link inventory; `legal.test.ts` updated for it. Full suite and typecheck pass.

**Owner review round 2 (agent, 2026-10-05).** Native `confirm()` replaced by a styled `<dialog>` (`src/components/confirm-dialog.astro`): a form with `data-confirm-message` is intercepted and submitted only on accept; cancel Assinatura is the danger tone, the Corretora number the primary tone; Esc, backdrop click and "Voltar" dismiss; without JS the forms submit as before. Termos de uso and Política de privacidade open in a modal (`legal-dialog.astro`) from the account footer; the `/termos-de-uso` and `/privacidade` routes stay for the marketing footer and direct links (dropping them is a separate call, see PLANNING §9). Tab bar scrollbar fixed (`overflow-x-auto` removed).
