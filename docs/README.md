# Documentação da Plataforma

Referência viva da arquitetura, convenções e decisões. Toda funcionalidade nova
deve linkar para o(s) documento(s) relevante(s) na descrição do PR.

## Índice

- [architecture.md](./architecture.md) — visão geral, camadas e fluxos.
- [rbac.md](./rbac.md) — Registry de permissões, `<Can>`, `usePermissions`, `requireAdmin`, `requirePermission`.
- [feature-flags.md](./feature-flags.md) — estratégias, escopo, rollout.
- [entity-history.md](./entity-history.md) — versionamento e diff.
- [domain-events.md](./domain-events.md) — catálogo e convenções de eventos.
- [auditing.md](./auditing.md) — audit log, correlation/request/session IDs.
- [flow-engine.md](./flow-engine.md) — máquina de estados, plugins, DLQ.
- [realtime.md](./realtime.md) — subscriptions, cleanup, dedupe, multi-aba.
- [module-conventions.md](./module-conventions.md) — checklist para novos módulos.
- [testing.md](./testing.md) — E2E, regressão visual, performance.
- [release-checklist.md](./release-checklist.md) — gate obrigatório antes de publicar.
- [adr/](./adr/) — Architecture Decision Records.

## Marcos

- **Flow Builder V1 — CONGELADO** (2026-07-19): status *Internally Production Ready — Pending Provider Acceptance*. Ver [`audits/flow-builder/FLOW-BUILDER-V1-FREEZE.md`](./audits/flow-builder/FLOW-BUILDER-V1-FREEZE.md).

