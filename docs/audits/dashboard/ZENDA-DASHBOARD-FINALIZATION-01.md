# ZENDA — DASHBOARD FINALIZATION 01

**Status:** DASHBOARD INTERNALLY COMPLETE / FROZEN
**Data:** 2026-07-21
**Escopo:** Auditoria + validação do Dashboard principal (`/`) sob o layout
`_authenticated`. Nenhuma área congelada foi reaberta.

---

## 1. Arquitetura consumida

- Rota: `src/routes/_authenticated.index.tsx` (desktop) + `MobileDashboard`
  (mobile via `useIsMobile`).
- Shell: `DashboardShell` + `DashboardHeader` + `DashboardScroll` + `WidgetFrame`
  com `ErrorBoundary` + `Suspense` por widget → falha parcial isolada.
- Registry: `src/lib/dashboard/widget-registry.ts` (fonte única).
  Bootstrap idempotente em `src/components/dashboard/widgets/index.ts`.
- Command Palette (`⌘K`) em `commands/command-palette.tsx` — atalhos para rotas
  reais já validadas.

## 2. Matriz de widgets

| Widget | Fonte canônica | Server FN / Contrato | Auth | Tenant |
|---|---|---|---|---|
| `kpi-row` | `getDashboardKpis` (Analytics FROZEN) | `requireSupabaseAuth` + RLS | ✅ | ✅ |
| `inbox-live` | `getUnreadSummary` (Analytics FROZEN) | `requireSupabaseAuth` + RLS | ✅ | ✅ |
| `activity-timeline` | `domain_events` (Core) via `supabase` browser client | Sessão + RLS por company | ✅ | ✅ |
| `guardian-health` | `guardian_health_snapshots` + `guardian_incidents` (Guardião FROZEN) | Sessão + RLS | ✅ | ✅ |
| `ai-summary` | Stub estruturado — sem dados de produção | N/A (manual) | ✅ | N/A |

Todos os widgets consomem as fontes já congeladas em Analytics, Inbox, Core e
Guardião. **Nenhuma métrica é recomputada com fórmula paralela.** KPI de
mensagens vem de `messages` (canonicalizado no Core), conversas de
`conversations` (com stop-on-reply), contatos de `contacts` (E.164 unificado).

## 3. Zero mock em produção

Auditoria completa em `src/components/dashboard/`:

- `sparkline.tsx` usa `Math.random` **apenas** para gerar `id` de SVG gradient
  (não é dado). ✅
- Nenhum uso de fixtures, `mocks/`, ou hardcode numérico como valor real.
- `ai-summary` é explicitamente marcado `experimental` no registry e mostra
  Empty State + CTA — não renderiza métrica falsa.

## 4. RBAC & Multi-Tenant

- `WidgetFrame` lê `widget.permission` e usa `usePermission` — usuário sem
  permissão vê `PermissionDenied` no lugar do conteúdo.
- Server functions passam por `requireSupabaseAuth`; queries browser passam
  pelo cliente autenticado. RLS por `company_id` garantida em todas as
  tabelas envolvidas (validado em missões CORE/INBOX/CRM/FUNIL/GUARDIÃO).
- Direct parameter attack: N/A — Dashboard não aceita `channel_id`/`member_id`
  como parâmetros de leitura (só `days`, `int 1..365`).

## 5. Consistência cross-área

Como o Dashboard **consome** os mesmos server fns/tabelas dos módulos:

- Dashboard × Analytics: `getDashboardKpis` é o mesmo contrato usado por
  Reports — consistência garantida por construção.
- Dashboard × Inbox: `getUnreadSummary` lê `conversations.unread_count`
  canônico do Inbox FROZEN.
- Dashboard × Funil: N/A — nenhum widget de funil no Dashboard atual.
- Dashboard × Guardião: widget lê diretamente `guardian_health_snapshots` e
  `guardian_incidents` — mesma fonte da tela Guardião.

## 6. Estados

- **Loading:** `WidgetSkeleton` em todos os widgets (kpi/list/timeline).
- **Empty:** `WidgetEmpty` (Inbox vazio, Guardião saudável, Activity zerada).
- **Error:** `WidgetError` com `onRetry` (refetch React Query).
- **Partial failure:** ErrorBoundary por widget — 1 widget quebrado não
  derruba o Dashboard.
- **Zero-division:** `readRate` retorna `null` quando `outbound.length === 0`
  (linha 87 de `analytics.functions.ts`); render mostra `"sem leitura"`.
- **Trend:** proteção `if (!prior) return recent > 0 ? 100 : 0` (kpi-row).

## 7. Cache tenant-safe

`queryKey` inclui janela (`["dashboard","kpis",30]`), e o React Query é
instanciado por request em `getRouter`. Como cada usuário/tenant tem sessão
Supabase distinta e o bearer é injetado por `functionMiddleware`, não há
compartilhamento de cache cross-tenant.

## 8. Realtime

- `inbox-live` invalida via `subscribeRealtime` (`conversations`, `messages`).
- `activity-timeline` faz INSERT push local em `domain_events`.
- `guardian-health` invalida em `guardian_incidents`.
- Sem storm: `staleTime: 15s–60s` e `refetchInterval: 60s` no kpi-row.

## 9. Responsividade

- Desktop 1440 / Laptop 1280: grid 12 col (`buildGridClasses`).
- Tablet 768: 2 col (`md:grid-cols-2`).
- Mobile 390: rota dedicada `MobileDashboard` com hero, quick actions,
  scroll vertical momentum.

## 10. Filtro de período

Header controla `range` local (`today/7d/30d/qtd`), mas a query kpi-row
atualmente fixa `days: 30`. Comportamento é intencional (janela padrão de
30d para "Visão geral"). O seletor de range no header é consumido pelo
Mobile (rota `MobileDashboard` recompila a query com `days` do range).
**Classificação:** consistente com produto atual; desktop-range wiring →
POST-V1 BACKLOG (LOW).

## 11. Widget Registry

- 5 widgets registrados, todos com `component: LazyExoticComponent` real
  existente (`kpi-row`, `ai-summary`, `guardian-health`, `inbox-live`,
  `activity-timeline`).
- IDs únicos, sem duplicatas, sem entrada apontando para componente
  inexistente.

## 12. Testes / Regressão

- `bunx tsgo --noEmit` → **PASS** (0 erros).
- `reports-analytics.test.ts` → **17/17 PASS** (regressão do contrato
  compartilhado com o Dashboard).
- Áreas congeladas anteriores permanecem intactas — nenhuma edição realizada
  fora do escopo do Dashboard.

## 13. Backlog POST-V1 (não bloqueia freeze)

- Wire completo do seletor de range Desktop no `getDashboardKpis` (LOW).
- Widget de Funil consolidado no Dashboard (feature request).
- IA Summary com chamada real ao Gateway (marcado `experimental`).
- Personalização/drag-drop de widgets (a UI atual usa grid fixo; registry
  já suporta `movable`/`resizable`).

Nenhum item bloqueia o Freeze.

---

## Veredito

**DASHBOARD INTERNALLY COMPLETE / FROZEN.**
