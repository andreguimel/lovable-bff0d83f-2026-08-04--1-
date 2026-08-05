# Fase 1 — Auditoria Read-Only

**Missão:** Mapear a plataforma Zenda em profundidade, sem alterar código, banco, arquitetura, runtime, providers, RBAC/RLS, event bus ou design system. Congelamento RC3.1 mantido integralmente.

**Data:** 2026-07-17
**Modo:** Read-only (auditoria + documentação + backlog)
**Escopo proibido:** Refatoração, migrations, novas funcionalidades, correções fora de Critical/High aprovados.

## Índice

| Documento | Escopo |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, camadas, boundaries, dependências |
| [DATABASE.md](./DATABASE.md) | Schema `public`, 69 tabelas, tamanho, hotspots |
| [RUNTIME.md](./RUNTIME.md) | Runtime Engine, executor, scheduler, WAIT |
| [SECURITY.md](./SECURITY.md) | RLS, GRANTs, SECURITY DEFINER, secrets |
| [API.md](./API.md) | Server Functions (263) + rotas `/api/public/*` (9) |
| [EVENTS.md](./EVENTS.md) | `flow_events`, `domain_events`, event bus |
| [STORAGE.md](./STORAGE.md) | 4 buckets, políticas, uso |
| [PERFORMANCE.md](./PERFORMANCE.md) | Seq scans, índices, hotspots |
| [OBSERVABILITY.md](./OBSERVABILITY.md) | Guardian, logs, métricas, healthchecks |
| [OPERATIONS.md](./OPERATIONS.md) | Deploy, cron, secrets, runbook |
| [backlog.md](./backlog.md) | Dívida priorizada Critical/High/Medium/Low |
| [recommendation.md](./recommendation.md) | Recomendação final sobre o congelamento |

## Classificação de risco (padrão)

- **Critical** — bloqueia piloto, impacta dados/segurança/uptime imediato.
- **High** — impacto real em produção; aprovar sub-missão antes do piloto ou logo após.
- **Medium** — dívida técnica relevante; agendar pós-piloto.
- **Low** — polimento, higiene, ergonomia.

## Números-chave do inventário

- **Rotas TSR:** 33 arquivos em `src/routes/`
- **Server Functions:** 263 chamadas `createServerFn` em 31 arquivos
- **Rotas HTTP públicas:** 9 endpoints em `src/routes/api/public/`
- **Tabelas `public`:** 69, todas com RLS ativo, 68 com pelo menos 1 policy
- **Migrations:** 54 arquivos (histórico completo preservado)
- **Buckets Storage:** 4 (`message-media`, `agent-knowledge`, `avatars`, `contact-files`), todos privados
- **LOC (`src/`):** ~65.7k linhas TS/TSX
- **Runtime:** único (`createAndExecuteRun` + `executeRun`), consolidado na missão RUNTIME-CANONICAL-ENFORCEMENT
