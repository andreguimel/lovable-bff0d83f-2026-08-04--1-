# EVENTS.md

## Estado atual

O sistema possui **duas superfícies de eventos append-only**:

### 1) `flow_events` (runtime engine)

Emitido exclusivamente pelo executor. Tipos observados em produção:

- `RuntimeRunCreated` — nova run criada
- `RuntimeVersionResolved` — versão publicada resolvida
- `RuntimeGraphResolved` — grafo carregado
- `RuntimeEntryNodeResolved` — nó de entrada calculado
- `NodeStarted` / `NodeFinished` — ciclo de vida de cada nó
- `FlowPaused` — WAIT / question
- `FlowResumed` — retomada via scheduler ou inbound
- `FlowCompleted` — término OK

**204 registros** em produção. RLS ativa (2 policies).

### 2) `domain_events` (bus de domínio)

Tabela pronta, atualmente **vazia** (0 registros). Índices `correlation_idx` e `type_version_idx` criados mas ainda sem uso (`idx_scan = 0`). RLS ativa (2 policies).

**Registry**: `src/lib/events/registry.ts` (arquivo único).

### 3) Auditoria de negócio

- `team_audit_log` — 14 colunas, alimentado por triggers (`audit_enrichment_suggestion_change`, `audit_message_deletion`, `accept_invite_token`).
- `team_entity_history` — histórico versionado por entidade.
- `channel_events` — 13 registros; eventos de canal (connected, disconnected, error).
- `guardian_incidents` / `guardian_runs` / `guardian_health_snapshots` — telemetria operacional.

## Pontos fortes

- **Append-only** em todas as tabelas de evento — auditabilidade completa.
- **Runtime engine emite eventos determinísticos** — a mesma execução gera sempre a mesma sequência (validado em RUNTIME-PARITY).
- **Triggers de auditoria** com `SECURITY DEFINER` + `search_path` fixo.
- **`bump_channel_metrics`** trigger agrega métricas de mensagens em tempo real por dia.
- **`bump_broadcast_counters`** trigger mantém contadores de broadcast atualizados.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| EVT-H-01 | **High** | `flow_events` sem retenção — cresce sem limite. Volume atual pequeno, mas em produção pode chegar a milhões/mês. Backlog `R2-L-11` (elevar). |
| EVT-M-02 | Medium | `domain_events` existe mas não é consumida em lugar nenhum — event bus está **planejado, não implementado**. Decidir: usar ou remover. |
| EVT-M-03 | Medium | Não há **event schema registry** versionado — payloads JSONB livres. |
| EVT-M-04 | Medium | Não há consumo assíncrono (subscriber pattern) — eventos são para auditoria + realtime, não para orquestração. Se domain_events vier a ser usado, definir consumidores. |
| EVT-L-05 | Low | `channel_events` sem retenção; volume baixo. |

## Evidências

- `SELECT distinct event_type FROM flow_events` → 9 tipos.
- `SELECT count(*) FROM domain_events` → 0.
- `SELECT count(*) FROM flow_events` → 204.
- Triggers: `bump_channel_metrics`, `bump_broadcast_counters`, `audit_enrichment_suggestion_change`, `audit_message_deletion`, `create_default_subscription`, `handle_new_user`, `set_updated_at`.

## Recomendações (backlog)

- **EVT-H-01** → job `pg_cron` diário deletando eventos > 30 dias (agrupar com DB-H-02/03). **Pós-piloto (30 dias)**.
- **EVT-M-02** → decisão de produto: manter `domain_events` como slot futuro ou remover. **Pós-piloto**.
- **EVT-M-03/04** → se manter, criar schema registry versionado. **Pós-piloto**.

**Recomendação Fase 1:** superfície de eventos **congelável**. Único ponto a agendar é retenção (EVT-H-01) — sem urgência para o piloto.
