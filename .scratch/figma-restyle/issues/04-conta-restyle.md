# 04: `/conta` restyled from the wireframes

**What to build:** The customer area takes the visual language of the `painel-cliente` and `estados-licenca` wireframes (Figma `86:1423` and `86:1602`; PNG exports: [painel-cliente](../wireframes/painel-cliente.png), [estados-licenca](../wireframes/estados-licenca.png)) with no change to content or behavior. The six Licença states (`none`, `awaiting_account`, `preparing`, `active`, `expired`, `revoked`), the Corretora account form, the Assinatura cancel and the email-only download path all work exactly as today.

Carry over from the wireframes:

- The product card, with a status badge carrying a Lucide icon per Licença state.
- Mono-font data rows, and the disabled-action style.
- The static "liberação só após confirmação do backend" note panel.
- The "Área do cliente" label in the header, next to the existing Sair.

The states the wireframes do not draw (`awaiting_account`, `preparing`, `active`, `revoked`, plus the Corretora form and its notice banners) are derived from the same card pattern. The owner reviews them in the browser.

Skip, on purpose:

- The tab bar, avatar and name, upgrade card, support card and invoice table.
- The Renovar licença, Baixar novamente and Download bloqueado buttons, and the checklist link. There is no download on `/conta`; it stays email-only in 0.1.
- The near-expiry state ("Vence em 5 dias") and chargeback-specific copy: deferred (see `.scratch/backlog.md`).

The page heading stays "Sua conta" and the domain term stays Robô. Copy goes in the typed content files, never inline in markup; anything `launchBlocking` stays marked.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-human

- [x] Each of the six Licença states renders as a card in the wireframe style, with an icon badge and a mono data row
- [x] The Corretora form, its notices and the cancel control appear in the new style and behave as before
- [x] The backend-confirmation note panel and the "Área do cliente" header label are present
- [x] None of the skipped elements appear
- [x] No behavior change: the existing content and `/conta` tests pass unchanged; any new copy lives in the content files
- [ ] The owner has viewed every state in the browser (`astro dev`) and signed off or listed changes
- [ ] Typecheck and the full test suite pass

## Comments

**Implementation (agent).** Built `src/components/license-card.astro` (icon tile, Lucide status badge, mono Licença/Assinatura data row, Corretora banner and form, rejected notice, cancel form; all `data-*` attributes, form actions and field names unchanged) and rewired `src/pages/conta.astro` to render it per Licença. The page header now holds the "Área do cliente" mono label above "Sua conta" with Sair on the same row (moved from the page bottom; `site-header.astro` untouched). The static backend-confirmation note panel closes the page. New copy lives in `src/content/conta.ts`: `licenseBadges` (label, icon key, tone per Licença state), `corretoraNoticeTones`, `backendNoteHeading`/`backendNoteBody`, `customerAreaLabel`. New tests in `src/content/conta-badges.test.ts`; existing `conta.test.ts` and `account-page.test.ts` pass unchanged. `pnpm typecheck` and `pnpm build` are clean; the full suite is left to the orchestrator and the browser sign-off to the owner.

Derived-state decisions (owner to review in the browser):
- Badge tones: `active` success; `expired` and `revoked` danger; `none`, `awaiting_account`, `preparing` neutral (brand-blue on emphasis surface). Labels: Pagamento pendente, Conta pendente, Em preparo, Licença ativa, Licença expirada, Licença revogada. Icons: hourglass, key-round, cog, shield-check, circle-x, shield-alert.
- The wireframe's "Pagamento confirmado pelo backend" / "Sem renovação confirmada" sub-lines were not added (they would be new claims); the data row is the existing Licença and Assinatura values in Geist Mono.
- Corretora banner is an inset panel (`surface-sunken`, `border-accent`) inside the card; the input uses the strong border and focus ring. Corretora notice banner: success tone for `saved`, danger for the three error notices. The rejected-payment notice is an emphasis-surface panel.
- The disabled-action style has no use on `/conta` once "Download bloqueado" is skipped, so it was not built.
- The backend note copy is wrapped in `launchBlocking` (adapted from the Figma frame, which mentions Pix/boleto and suspension; owner approval pending).
- Card title is "Licença" (the Robô name stays as the group `h2`); the Corretora banner heading dropped from `h3` to `h4` under it.
