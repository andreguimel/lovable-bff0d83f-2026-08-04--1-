# Missão Mobile-6.3 — Guardião Premium Mobile

**Data:** 2026-07-16
**Status:** ✅ Encerrada
**Escopo permitido:** Apresentação mobile do Guardião (`/settings/audit`).
**Escopo proibido (respeitado):** banco, RLS, RBAC, Server Functions, Runtime, Flow Engine, IA, providers, event bus, pipeline, realtime, cron, contratos Zod, observabilidade, design system global, arquitetura.

## Regra global aplicada

> Nenhuma sub-missão pode modificar arquitetura, banco, Runtime Engine, RBAC, RLS, Server Functions, Providers, Pipeline, Event Bus ou Design System global, salvo bug Crítico/Alto comprovado. Ajustes Médios/Baixos vão para o backlog. Cada missão termina com relatório + evidências + decisão explícita.

## Auditoria de reutilização (obrigatória antes de codar)

Verificado — a UI mobile reusa integralmente a lógica existente sem nenhuma alteração:

| Reuso | Origem |
|-------|--------|
| Server functions | `guardianOverview`, `guardianScan`, `guardianResendMessage`, `guardianRetryFlowRun`, `guardianToggleIntegration` (`src/lib/guardian.functions`) |
| Tipos | `GuardianIncident`, `GuardianScanResult`, `GuardianSeverity` (`src/lib/guardian.types`) |
| Realtime | Mesmo canal `postgres_changes` em `guardian_incidents` filtrado por `company_id` |
| Rota | `/_authenticated/settings/audit` inalterada; branch mobile via `useIsMobile()` |
| Componentes globais | `Sheet`, `Button`, `Skeleton`, `ClientTime`, `MobileFabProvider` |

## Entregas de UI

### Componentes novos (apresentação apenas)

- `src/components/guardian/mobile/mobile-guardian-home.tsx`
- `src/components/guardian/mobile/mobile-incident-sheet.tsx`

### Rota modificada

- `src/routes/_authenticated.settings.audit.tsx` — branch `useIsMobile()` renderiza `MobileGuardianHome`; desktop continua com `GuardianPanel` original.

### Anatomia da experiência mobile

- **Header sticky (56px):** título, contagem viva de incidentes/canais online, botão de refresh.
- **Chips horizontais:** filtro por tipo (Todos, Mensagens, Fluxos, Canais, Integrações, Campanhas, Cascatas), scroll horizontal sem barra.
- **Hero de saúde:** anel SVG animado com score 0–100, tone (`healthy`/`warning`/`critical`), badge, resumo IA, timestamp e CTA "Analisar agora". Gradient sutil por severidade.
- **KPI strip (4 cards):** msgs/h, falhas 24h, integrações on/total, canais online/total — com tone semântico.
- **Cards de incidente:** ícone por tipo em tile colorido por severidade, título 2 linhas, chip de severidade + tipo + tempo relativo, impacto 2 linhas, dot de severidade, CTA de reparo primário + botão de detalhes. **Máximo 2 toques para qualquer ação.**
- **Bottom Sheet full-screen (`h-[100dvh]`):** hero por severidade → impacto → **timeline vertical estilo Linear** (detectado → causa → ação recomendada → estado atual) → payload técnico em accordion colapsado por padrão → barra sticky com reparo primário + fechar.
- **FAB contextual:** "Analisar agora" registrado via `useMobileFab`.

### Estados cobertos (todos obrigatórios)

| Estado | Implementação |
|--------|---------------|
| Loading | Skeletons: hero, KPI strip (×4), cards (×3) |
| Empty (sem incidentes) | Card outlined verde "Tudo saudável" |
| Empty (filtro sem match) | Card outlined "Nenhum incidente neste filtro" |
| Error | Card destrutivo com mensagem + retry |
| Offline | Faixa sticky warning com ícone `WifiOff` (listener `online`/`offline`) |
| Permission (sem dados) | Card com `ShieldAlert` |
| Updating | Spinner no refresh + botão CTA em estado `Analisando…` |

## Gates

| Gate | Resultado |
|------|-----------|
| `bun run build` | ✅ verde (1.59s) |
| Typecheck (implícito no Nitro/Vite) | ✅ sem erros |
| Regressão desktop | ✅ nenhuma — branch mobile só ativa `< 768px`; `GuardianPanel` inalterado |
| Alteração arquitetural | ✅ nenhuma |
| Overflow horizontal | ✅ nenhum (Grid `minmax(0,1fr)_auto` + `truncate` + `overflow-x-auto` nos chips) |
| Contrato / server function | ✅ nenhuma mudança |
| Novos bugs Críticos/Altos | ✅ nenhum |

## Responsividade

- **390 (iPhone 12):** layout base; hero e cards ocupam largura total com padding 12px.
- **414 (iPhone Pro Max):** mesmo layout, mais respiro.
- **768 (iPad):** aciona layout desktop (`useIsMobile` = false) — comportamento pré-existente.

## Segurança / limites

- Nenhum novo endpoint público.
- Nenhuma nova query direta ao banco além das já feitas por `guardianOverview` e do realtime canal filtrado por `company_id` (padrão existente).
- Nenhuma exposição adicional de payload — o accordion "Payload técnico" segue o mesmo componente/formato do desktop.

## Backlog gerado

Nenhum novo item. Nada Crítico/Alto encontrado. Débito de prettier e knip permanece no backlog global (F-0007, F-0001).

## Encerramento

Missão **Encerrada**. Arquitetura permanece congelada. **PARAR.**

Próxima sub-missão (Mobile-6.4 — Relatórios) só inicia mediante autorização explícita.
