# OBSERVABILITY.md

## Estado atual

Sistema de observabilidade **Guardian** com 3 planos de dados + healthchecks + audit log.

### Guardian

- `guardian_runs` — 436 registros; ciclo periódico de verificação (RLS ativa, 2 policies).
- `guardian_health_snapshots` — 424 registros; snapshot por check.
- `guardian_incidents` — 20 registros; incidents abertos/resolvidos (RLS ativa, 3 policies).

Fontes: `src/lib/guardian.functions.ts`, `guardian.server.ts`, `guardian-reporter.ts`, `guardian.types.ts`. Healthchecks em `src/lib/health/checks/`.

### Scheduler

- `scheduler_heartbeats` — **521 registros em 24h**, confirmando cron ativo.
- Executado via `pg_cron` → `/api/public/*` (flow-resume, cascade-tick, guardian-cron).

### Healthcheck endpoints

- `/api/public/health` — geral (banco + storage + auth).
- `/api/public/live` — liveness (Worker está de pé).
- `/api/public/ready` — readiness (banco alcançável).
- `/api/public/metrics` — métricas.

### Auditoria

- `team_audit_log` — 14 colunas, populada por triggers.
- `team_entity_history` — versão histórica de entidades sensíveis.

### Client-side error capture

- `src/lib/error-capture.ts` + `src/lib/lovable-error-reporting.ts` — captura de erros de runtime no cliente.
- `src/lib/observability/` — camada de emissão (existe, verificar consumo).

## Pontos fortes

- **Guardian ativo** em produção — snapshots + incidents alimentados sem manual.
- **Healthchecks separados** (live/ready/health) — padrão Kubernetes/LB.
- **Audit log** em todas as ações sensíveis (delete de msg, aceite de convite, sugestões de enrichment).
- **Scheduler observável** por heartbeats.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| OBS-H-01 | **High** | Sem alerting externo — se Guardian abrir incident, ninguém é notificado (nem email/webhook/Slack). |
| OBS-H-02 | **High** | Sem dashboard operacional agregado — dados existem em `guardian_*` mas não há tela consolidada de "saúde do sistema" para o time. |
| OBS-M-03 | Medium | `domain_events` não usado — impede correlação de eventos de negócio com incidents. |
| OBS-M-04 | Medium | Sem log estruturado exportável (JSON lines para SIEM/Datadog). |
| OBS-M-05 | Medium | Retenção de `guardian_*` indefinida (ver DB-H-02). |
| OBS-L-06 | Low | Métricas `/api/public/metrics` não seguem formato Prometheus (validar). |

## Evidências

- `SELECT count(*) FROM guardian_runs` → 436.
- `SELECT count(*) FROM scheduler_heartbeats` → 521.
- `SELECT count(*) FROM guardian_incidents` → 20 (todos revisados nos relatórios anteriores).
- 3 healthcheck endpoints ativos em produção (`live.ts`, `ready.ts`, `health.ts`).

## Recomendações (backlog)

- **OBS-H-01** → integrar Guardian com webhook (Slack/Discord/email) ao abrir incident High/Critical. **Antes do piloto público** (mesmo que MVP: email para admin da company).
- **OBS-H-02** → tela `/settings/health` (ou seção no admin) com últimos snapshots + incidents abertos. **Pós-piloto imediato**.
- **OBS-M-03..05** → pós-piloto.

**Recomendação Fase 1:** observabilidade **congelável para piloto controlado** (WebMarcas — time responde direto). Antes de escalar para múltiplos tenants, **OBS-H-01** vira sub-missão obrigatória.
