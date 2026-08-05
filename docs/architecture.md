# Plataforma — Arquitetura da Onda 2

_Atualizado automaticamente na entrega da Onda 2._

## Camadas

```
UI (React) ── hooks (usePermissions, useFeatureFlag) ── Server Fns ── Postgres/RPC
                                    │
                                    ├── RBAC (permissions, role_permissions_v2, overrides)
                                    ├── Feature Flags (rollout, roles, users, deps)
                                    ├── Entity History (versão + revision hash + correlation)
                                    ├── Audit Log (correlation/request/session/error_code/ip/ua)
                                    └── Domain Events (bus desacoplado)
```

## RBAC

- Registry central: `src/lib/rbac/registry.ts` (`P.CRM.EDIT`, `P.FLOWS.PUBLISH`, …).
- Verificação DB: `has_permission(user, key)` (SECURITY DEFINER).
- Consumo UI: `<Can permission={P.X.Y}>…</Can>` + `usePermission(key)`.
- Matriz visual em **Equipe → Permissões**.
- Overrides individuais em **MemberSheet → Permissões** com visualização
  `herdada + override = efetiva`.

## Feature Flags

- Estratégias: `boolean`, `percentage` (hash determinístico), `role`, `user`.
- Extras: dependências (`depends_on`), expiração (`expires_at`), ambiente.
- Painel: `/settings/feature-flags`.
- Consumo server: `evaluateFeatureFlag({ key })`.

## Entity History

- Colunas: `version`, `revision_hash`, `change_reason`, `correlation_id`.
- Componente reutilizável: `<EntityHistoryTimeline entity entityId />` — usado em
  aba Histórico da Equipe e em cada aba de Member Sheet.

## Audit Correlation

- Toda mutação admin insere `correlation_id` (uuid) em `team_audit_log` +
  `domain_events`. Facilita rastrear "uma ação inteira" cruzando módulos.
- Helper: `buildAuditMeta()` em `src/lib/observability/correlation.ts`.

## Domain Events

- Tabela `domain_events` (`event_type`, `aggregate_type`, `aggregate_id`, `payload`).
- Eventos emitidos: `RolePermissionsChanged`, `FeatureFlagChanged`,
  `DepartmentCreated`, `QueueUpdated`, `InviteAccepted`, `RoleChanged`,
  `FlowPublished`, `AgentExecuted` (à medida que módulos são migrados).
- Consumidores futuros: Analytics, Guardião, Inbox, CRM leem sem acoplamento.

## Error Codes

- Registry: `src/lib/errors/codes.ts` (`FLOW_001`, `TEAM_403`, `FF_002`, …).
- Uso: `throwFriendly("FLOW_005", "provedor recusou")`.

## UX States

- Componentes canônicos em `src/components/ui/states/`:
  - `LoadingState`, `InlineSpinner`
  - `ErrorState` (com `onRetry`)
  - `PermissionDenied`
  - `OfflineBanner` (montado globalmente em `__root.tsx`)
  - `EmptyState` (já existente)

## Convenções para Novos Módulos

1. **Toda permissão** vem do registry — nunca string solta.
2. **Toda mutação admin** grava audit + entity history + domain event com
   `correlation_id`.
3. **Feature flags** para tudo que pode ser gradual/canário.
4. **States UX** sempre importados do `states/` — não crie divs "loading" ad-hoc.
5. **Pense em plataforma**: antes de criar tabela/hook/componente, pesquise
   `rg` por algo similar. Reutilize.
