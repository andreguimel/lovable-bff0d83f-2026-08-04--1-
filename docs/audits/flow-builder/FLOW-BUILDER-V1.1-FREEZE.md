# FLOW BUILDER V1.1 — FREEZE

**Status:** ⏸ **PENDING OWNER VISUAL ACCEPTANCE**

> Este documento só entra em vigor após o proprietário confirmar explicitamente o aceite visual descrito em `FB-12.7-FINAL-ACCEPTANCE-GATE.md`. Até lá, o Flow Builder V1.1 permanece em estado READY FOR OWNER ACCEPTANCE.

## Escopo congelado (assim que aceito)

Ciclo FB-12 completo:

| Missão | Entrega |
| --- | --- |
| FB-12.1 | Persistência canônica (21 kinds, fonte única `blocks/kinds.ts`) |
| FB-12.2 | Auto-layout on-load (respeita posições humanas) |
| FB-12.3 | Fit-view útil (`padding 0.35`, `minZoom 0.55`) |
| FB-12.4 | Add-on-handle `+` + mini-palette contextual |
| FB-12.5 | Edge labels multi-saída (Sim/Não, Opções, Rotas) |
| FB-12.6 | Library collapse/expand com persistência |
| FB-12.7 | Gate final funcional + visual |

Anteriores (V1.0) permanecem: FB-10.4A Menu, FB-10.4B Ação, FB-10.4C Conexão de Fluxo, FB-10.4D Randomizador, FB-10.5 Condition Engine + HTTP seguro, FB-HOTFIX-01, FB-11.EXEC.

## Métricas ao congelar

- Testes Flow Builder: **222/222 PASS** · 1305 asserts.
- Typecheck: limpo.
- CRITICAL: 0 · HIGH: 0.
- Paridade UX vs BotConversa: **83,7 / 100**.

## Após o aceite

1. Registrar marco no `docs/README.md` sob "Flow Builder V1.1 — CONGELADO".
2. Migrar Medium/Low do FB-12.7 para `docs/audits/master-audit/backlog.md`.
3. Nenhuma missão FB-12.8 ou FB-13 será aberta sem novo Critical/High comprovado.

## Próxima aba autorizada após Freeze

A definir pelo proprietário (candidatos naturais do checkpoint master: Inbox UX A/B restantes, Provider W3 real).

---

**Aguardando exclusivamente:**

- `APROVADO` → este documento passa a `ATIVO` e o Flow Builder V1.1 é congelado; ou
- `REPROVADO COM BLOQUEADOR ESPECÍFICO` → abrir HOTFIX FINAL de escopo mínimo.
