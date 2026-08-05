# Phase 1 — Baseline de Performance do Dashboard

**Data:** 2026-07-15
**Rota:** `/` (Dashboard autenticado)
**Contexto:** Referência para regressão da Fase 2. Não é meta — é linha de base.

> Métricas coletadas a partir da build de produção atual (Vite + TanStack Start),
> em ambiente de preview. Este documento é atualizado a cada Gate (RCx).

## Métricas de referência

| Métrica | Valor | Fonte |
|---|---|---|
| Bundle inicial da rota `/` (chunks críticos) | ~ registrado no build Vite | `vite build` |
| TTI estimado (SSR + hidratação) | ~ registrado em ambiente preview | Preview Lovable |
| FCP / LCP | ~ pendente coleta via Playwright | backlog Bloco C |
| Heap após load | ~ pendente coleta via DevTools | backlog Bloco C |
| Re-renders no primeiro segundo | ~ pendente `why-did-you-render` | backlog |
| Latência média de update realtime | ~ pendente medição controlada | backlog Bloco C |

## Como este documento evolui

- Cada RC (RC1, RC2, …) adiciona uma nova coluna de comparação.
- Regressão superior a **+15%** em qualquer métrica exige justificativa técnica no PR.
- Coleta automatizada será implementada no Bloco C (Playwright + Lighthouse-CI).

## Estado atual da coleta

Esta baseline é intencionalmente **conservadora e parcial**: registra apenas
o que já é observável sem instrumentação nova, respeitando a regra do Gate
de **não implementar funcionalidades novas**. Instrumentação completa
(bundle analyzer, Lighthouse-CI, why-did-you-render) está agendada como
parte do Bloco C.
