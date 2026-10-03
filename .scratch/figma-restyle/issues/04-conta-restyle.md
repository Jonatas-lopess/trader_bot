# 04: `/conta` restyled from the wireframes

**What to build:** The customer area takes the visual language of the `painel-cliente` and `estados-licenca` wireframes (Figma `86:1423` and `86:1602`; PNG exports in the repo root) with no change to content or behavior. The six Licença states (`none`, `awaiting_account`, `preparing`, `active`, `expired`, `revoked`), the Corretora account form, the Assinatura cancel and the email-only download path all work exactly as today.

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

**Status:** ready-for-agent

- [ ] Each of the six Licença states renders as a card in the wireframe style, with an icon badge and a mono data row
- [ ] The Corretora form, its notices and the cancel control appear in the new style and behave as before
- [ ] The backend-confirmation note panel and the "Área do cliente" header label are present
- [ ] None of the skipped elements appear
- [ ] No behavior change: the existing content and `/conta` tests pass unchanged; any new copy lives in the content files
- [ ] The owner has viewed every state in the browser (`astro dev`) and signed off or listed changes
- [ ] Typecheck and the full test suite pass

## Comments
