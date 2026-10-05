# 01: Support channel (replaces the inert Contato and "Falar com o suporte")

**Blocked by:** —

**Status:** done

**What to build:** a real support destination. 0.1 channel is e-mail only (no chat, no ticket system). One `supportEmail` in a new `src/content/support.ts`, `launchBlocking` (the address needs the production domain, a go-live prerequisite). Footer "Contato" and the "Falar com o suporte" button on `/conta` become `mailto:` links; both leave `src/content/dead-links.ts`.

Why it comes first: every Cliente-facing sentence that says "fale com o suporte" (`conta.ts`, `checkout-confirmation.ts`, FAQ) points at nothing today, and the withdrawal request (02) needs somewhere to land.

- [x] `supportEmail` in `src/content/support.ts`, `launchBlocking`, listed by the grep
- [x] Footer Contato and `/conta` support card render `<a href="mailto:…">`, not inert `<span>`
- [x] `deadLinks.contato` and `deadLinks.suporte` removed; `dead-links.ts` header comment updated
- [x] Wireframe's "suporte prioritário por e-mail e chat" stays out (plan claim, still no backing)
- [x] `pnpm test` passes

## Decisions / Notes

- Open for the owner: the address (`suporte@<domain>`) and whether replies come from Resend or a plain mailbox. Neither blocks the build, only go-live.
- Closes the "Support channel" item in `.scratch/backlog.md`.
