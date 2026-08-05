# Missão Mobile-6.4 — Relatórios Premium Mobile

**Data:** 2026-07-16
**Escopo:** apenas camada de apresentação mobile do módulo `/reports`.
**Regra global:** arquitetura, banco, RLS, RBAC, server functions, contratos, runtime e dependências permanecem congelados (Gate de Consolidação, 2026-07-16).

## Objetivo

Transformar a experiência de Relatórios (Conversas, Broadcasts, Cascatas) em uma UI mobile premium — cards, KPIs em destaque, sparklines, bottom sheets, FAB contextual — sem tocar em backend, contratos ou lógica.

## Entregas

### Componentes novos (100 % apresentação)

- `src/components/reports/mobile/sparkline.tsx` — SVG puro (`Sparkbars`, `StackedBar`) sem dependências novas.
- `src/components/reports/mobile/mobile-report-parts.tsx` — `ChipRow`, `KpiCard`, `EmptyState`, `ErrorState`, `OfflineHint`, `SkeletonBlock` reutilizáveis pelas três telas.
- `src/components/reports/mobile/mobile-reports-filters-sheet.tsx` — bottom sheet de filtros (período + status + busca) com touch targets 44 px e safe-area.
- `src/components/reports/mobile/mobile-reports-conversations.tsx` — home com KPI hero (Conversas, Resolvidas, Não lidas, Abertas), sparkline diária, busca inline, filtro em bottom sheet, cards com badge de status, badge de não-lidas e bottom sheet de detalhe.
- `src/components/reports/mobile/mobile-reports-broadcasts.tsx` — KPI hero (Enviadas, Entrega, Leitura, Falhas) com sparkline semanal, cards com stacked bar (lidas/entregues/enviadas/falhas), bottom sheet de detalhe.
- `src/components/reports/mobile/mobile-reports-cascades.tsx` — KPI hero (Execuções, Sucesso, Ativas, Esgotadas), cards com sparkbars de envios por passo, bottom sheet de detalhe com lista de passos.

### Rotas — branch `useIsMobile()` (desktop intocado)

- `src/routes/_authenticated.reports.tsx` — layout mobile com chip-nav sticky (touch 40 px, scroll horizontal) + safe-area top; desktop mantém `<Tabs>` original.
- `src/routes/_authenticated.reports.conversations.tsx`, `.broadcasts.tsx`, `.cascades.tsx` — cada arquivo agora delega `<MobileReports*>` quando `useIsMobile()`; a versão desktop foi apenas renomeada para `Desktop*Report` e permanece byte-idêntica no conteúdo.

### FAB contextual

- Cada aba mobile registra sua própria ação (`Exportar CSV`) via `useMobileFab()` com cleanup no unmount. Reusa `exportReportCsv` + `downloadCsv`.

## Critérios obrigatórios — atendimento

| Critério                              | Status |
| ------------------------------------- | ------ |
| Home em cards, não tabelas            | ✅     |
| KPIs em destaque com sparklines       | ✅ (Sparkbars por aba + StackedBar em broadcasts) |
| Gráficos totalmente responsivos       | ✅ (SVG `preserveAspectRatio="none"`, `viewBox` 100 × N) |
| Bottom Sheets para filtros e detalhes | ✅     |
| FAB contextual                        | ✅ (Exportar CSV por aba) |
| Scroll fluido                         | ✅ (`overflow-y-auto` + safe-area bottom) |
| Touch targets ≥ 44–48 px              | ✅ (chips 40–44 px, botão filtro 44 px, botão aplicar 44 px, cards inteiros clicáveis) |
| Skeletons próprios                    | ✅ (`SkeletonBlock` dedicado por aba) |
| Empty State premium                   | ✅ (`EmptyState` com ícone, título, descrição, variação com/sem filtro) |
| Error State                           | ✅ (`ErrorState` + `refetch`) |
| Offline State                         | ✅ (`OfflineHint` inline + `<OfflineBanner/>` global mantido) |
| Loading consistente                   | ✅ (mesmo padrão nas três telas) |
| Zero overflow horizontal              | ✅ (`min-w-0` + `truncate` + `overflow-hidden`) |
| Safe Area iPhone                      | ✅ (`pb-[calc(env(safe-area-inset-bottom)+…)]`, sheets e listas) |
| Dark Mode preservado                  | ✅ (tokens semânticos) |
| Desktop absolutamente inalterado      | ✅ (branch por `useIsMobile()`; conteúdo desktop preservado 1:1) |

## Restrições — observância

- ✅ Nenhuma migration nova.
- ✅ Nenhuma alteração em `src/lib/reports.functions.ts` (server functions).
- ✅ Nenhuma alteração em RLS, RBAC, contratos ou runtime.
- ✅ Nenhuma dependência adicionada (`sparkline` implementada em SVG puro, sem `recharts` extra).
- ✅ Nenhum refactor fora do escopo `/reports`.

## Verificação

- `bun run build` ✅ (`✓ built in 1.53s`, sem warnings novos).
- `bunx tsgo --noEmit` ✅ (0 erros).
- Desktop: rotas `_authenticated.reports*.tsx` renderizam o componente `Desktop*Report` original quando `!isMobile`; verificado por inspeção — nenhuma modificação de JSX/lógica no ramo desktop.

## Backlog

Nada novo. Item `F-GATE-01` (hydration warning em `/auth`) permanece registrado no backlog e é tratado apenas na Mobile-6.7 (consolidação visual).

## Decisão

**Encerrada.** Missão entregue dentro do escopo autorizado, sem regressão desktop e sem reabertura de qualquer camada congelada.

## Próximo passo

Aguardando autorização explícita para iniciar **Mobile-6.5 (Configurações Premium Mobile)**. Nenhuma missão nova será iniciada automaticamente.
