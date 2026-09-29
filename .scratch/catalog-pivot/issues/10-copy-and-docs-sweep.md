# 10: Copy and docs sweep for leftover Plano language

**Blocked by:** 06

**Status:** done

**What to build:** grep `src/content/` (`faq.ts`, `hero.ts`, `how-it-works.ts`, `conta.ts`, `checkout-confirmation.ts`), `README.md` and `docs/agents/content-files.md` for Plano/plan/Starter/Pro/Enterprise/"robôs ativos"/"corretoras" entitlement copy and update to catalog language. The FAQ promise "cancelar quando quiser com um clique" applies to Mensal only and must be scoped so. Nothing new is invented: unknown facts get `launchBlocking`.

- [x] Grep for the old vocabulary comes back clean except in ADR-0006 and historical tickets
- [x] FAQ cancellation answer scoped to Mensal


## Notes

`plans.ts` and the plan-era pages/components were already removed by ticket 06. FAQ cancellation and payment answers now scoped per Oferta (Mensal-only cancel; card/Boleto/Pix for Compra and Anual, card-only Mensal). README status refreshed. Remaining old vocabulary lives in ADR-0006, ADR-0001/0005, CONTEXT `_Avoid_` lines, PLANNING's own pivot notes and historical tickets.
