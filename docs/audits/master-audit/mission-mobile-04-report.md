# Mission Mobile-04 — Dashboard Control Center

**Escopo:** apenas camada de apresentação mobile do Dashboard (viewport < 768px) e remoção da notificação "offline" sobreposta ao bottom-nav.
**Nenhuma alteração** em backend, banco, APIs, RBAC, regras de negócio, hooks ou server functions.

## Auditoria de reutilização

| Recurso | Estratégia |
|---|---|
| `getDashboardKpis` server fn | **Reutilizado** com mesma queryKey `["dashboard","kpis",days]` — cache compartilhado com o desktop |
| `getUnreadSummary` | Reutilizado (`["dashboard","inbox-live"]`) |
| `AiSummaryWidget` | Reutilizado dentro de card mobile |
| `ActivityTimelineWidget` | Reutilizado (já é realtime via `subscribeRealtime`) |
| Guardian health snapshot + incidents | Reutilizados via mesma consulta e canal realtime |
| `Sparkline`, `TrendBadge` | Reutilizados |
| `greetingByHour` | Reutilizado |
| `useMobileFab` (Mobile-1) | Reutilizado para FAB "Ações rápidas" |

## Componente novo

- `src/components/dashboard/mobile/mobile-dashboard.tsx`
  - **Hero:** saudação + empresa + hora do dia; mini cards de Saúde e Pendentes; CTA "Ver relatórios completos".
  - **Range pills** stick topo: Hoje / 7d / 30d / Trim.
  - **KPIs** em grid 2×2 compacto (Conversas, Contatos, Enviadas, Cascatas) com sparkline e trend.
  - **Alertas** priorizados por severidade (critical → low), realtime.
  - **Ações rápidas** — grid 3×2 inline + FAB (bottom sheet com 6 ações).
  - **IA** — `AiSummaryWidget` embutido.
  - **Timeline** — `ActivityTimelineWidget` embutido.
  - Suspense + Skeletons por seção; nenhuma seção bloqueia outra.

## Wiring / Fixes

- `src/routes/_authenticated.index.tsx`: `useIsMobile()` alterna entre `MobileDashboard` e `Dashboard` desktop; o desktop permanece intocado.
- `src/routes/__root.tsx`: removido `<OfflineBanner />` — o banner `fixed bottom-4` sobrepunha o bottom-nav e piscava em redes instáveis. Componente `offline-state.tsx` mantido para reuso futuro se necessário.

## Critérios atendidos

- [x] Hero Card com saúde, pendências e IA CTA
- [x] KPIs em cards grandes 2×2 com sparkline + trend, atualização automática (60s)
- [x] Quick Actions inline + FAB com bottom sheet
- [x] Alertas priorizados, realtime
- [x] Widgets independentes com skeleton/erro (Suspense por seção)
- [x] IA como assistente
- [x] Timeline agrupada (via widget existente)
- [x] Um único scroll principal
- [x] Sem overflow horizontal
- [x] Typecheck aprovado
- [x] Desktop não alterado
- [x] Notificação offline removida (não interfere mais com bottom-nav)

## Backlog residual (Mobile-08)

- Personalização (ocultar/reordenar seções mobile) — depende de persistência de layout.
- Suite Playwright dedicada ao Dashboard Mobile em 390/414/768 portrait+landscape.
- Widget de campanhas/fluxos com erro (quando existir server fn agregadora).
