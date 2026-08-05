# Backlog Fase 1 — Priorizado

Todos os itens abaixo são **registros**, não missões abertas. Nenhum foi corrigido nesta fase (regra read-only). Cada Critical/High pode virar sub-missão individual **mediante aprovação explícita**.

## Critical

**Nenhum item Critical identificado.** O Core está congelável.

## High (recomendados antes ou logo após o piloto público)

| ID | Área | Descrição | Sugestão |
|---|---|---|---|
| **SEC-H-01** / DB-H-01 | Security / DB | `public.exec_read_sql` (SECURITY DEFINER, `authenticated` EXECUTE) tem parser textual bypassável — potencial leitura cross-tenant | Substituir por whitelist de queries nomeadas em server function autenticada; ou revogar EXECUTE. **Antes do piloto público.** |
| **SEC-H-02** | Security | 12 funções DEFINER com EXECUTE amplo (backlog master F-0004) | Auditar e revogar EXECUTE de `anon` onde possível. **Antes do piloto público.** |
| **SEC-H-03** | Security | Password HIBP Check pode estar desligado | Verificar em Cloud → Users → Auth Settings; ligar. **Antes do piloto público.** |
| **OBS-H-01** | Observability | Guardian abre incident mas ninguém é notificado (sem alerting) | Webhook Slack/email para incidents High/Critical. **Antes do piloto público.** |
| **OBS-H-02** | Observability | Sem dashboard consolidado de saúde | Tela `/settings/health` com snapshots + incidents. **Pós-piloto imediato.** |
| **OPS-H-01** | Operations | Sem runbook de incidente documentado | Criar `docs/ops/runbook.md` com 6-8 cenários. **Antes do piloto público** (só doc). |
| **OPS-H-02** | Operations | Sem rotação de secrets documentada | Definir cadência semestral. **Antes do piloto público** (só doc). |
| **RT-H-01** | Runtime | `provider_message_id` NULL em mensagens do executor com placeholder — quebra ack | Sub-missão isolada. **Logo após piloto ou antes se WebMarcas usar canal real.** |
| **RT-H-02** | Runtime | `deleteFlow` cria órfãos em `flow_run_steps`/`flow_events`/`flow_dead_letter`/`flow_versions` | Sub-missão isolada. **Pós-piloto.** |
| **RT-H-03** | Runtime | `saveFlowGraph` sem transação | Sub-missão isolada. **Pós-piloto.** |
| **DB-H-02** | DB | `guardian_health_snapshots`/`guardian_runs` sem retenção | Job `pg_cron` de TTL 30 dias. **Pós-piloto (30 dias).** |
| **DB-H-03** / EVT-H-01 | DB / Events | `flow_events`/`flow_run_steps` sem retenção | Job `pg_cron` de TTL 30 dias. **Pós-piloto (30 dias).** |
| **ARCH-H-01** | Arch | 43 arquivos no topo de `src/lib/` — falta subdomínios | Reorganizar em `flows/`, `inbox/`, `crm/`, etc. **Pós-piloto.** |

## Medium (agendar pós-piloto)

| ID | Descrição |
|---|---|
| ARCH-M-02 | Convenção `.server`/`.functions` OK mas documentar por subdomínio |
| ARCH-M-03 | Consolidar Zod em `src/lib/contracts/` |
| DB-M-04 | Autovacuum frequência baixa em `flow_runs`/`conversations`/`channel_metrics_daily`/`flow_nodes` |
| DB-M-05 | 30+ índices ociosos — reavaliar após 30 dias |
| DB-M-06 | Extensões em `public` — mover para schema `extensions` |
| SEC-M-04 | Idem DB-M-06 (aspecto segurança) |
| SEC-M-05 | Cobertura de testes de RLS parcial |
| API-M-01 | Contratos Zod duplicados |
| API-M-02 | `AppError` (ADR-005) não adotado em 25 functions |
| API-M-03 | Sem testes de contrato `/api/public/*` |
| EVT-M-02 | `domain_events` planejado mas sem consumidores — decidir |
| EVT-M-03 | Sem schema registry versionado |
| EVT-M-04 | Sem subscriber pattern |
| ST-M-01 | Sem lifecycle para `message-media` |
| ST-M-02 | `plan_limits.storage_mb` não enforçado |
| PERF-M-01 | Baseline p50/p95 desatualizado |
| PERF-M-02 | Sem monitoramento `pg_stat_statements` |
| PERF-M-03 | Cold start Worker por chunks pesados |
| OBS-M-03 | `domain_events` não integrado a incidents |
| OBS-M-04 | Sem log estruturado exportável |
| OBS-M-05 | Retenção `guardian_*` (ver DB-H-02) |
| OPS-M-03 | Sem checklist pré-publicação automatizado |
| OPS-M-04 | Sem staging separado |
| OPS-M-05 | Sem plano DR documentado (RPO/RTO) |
| RT-M-04 | `resolveVars` sem fallback objetos + duplicado Test Drawer |
| RT-M-05 | `/api/public/flow-resume` sem `ORDER BY resume_at`, batch fixo 20 |
| RT-M-06 | Nó `question` sem pausa automática |
| RT-M-07 | `assign_agent` reutiliza `transferNode` |

## Low (polimento)

| ID | Descrição |
|---|---|
| ARCH-L-04 | Grafo `madge` como artefato de CI |
| DB-L-07 | `companies.slug_key` sem uso |
| SEC-L-06 | Cadência de rotação de secrets |
| API-L-04 | Versionamento explícito de payloads |
| EVT-L-05 | Retenção `channel_events` |
| ST-L-03 | Testes de policy de bucket |
| ST-L-04 | 3 buckets sem uso — validar antes do piloto |
| PERF-L-04 | Remoção de índices ociosos |
| OBS-L-06 | Formato Prometheus em `/metrics` |
| OPS-L-06 | Doc de onboarding operador |
| RT-L-08 | Reset de `seq` em retomadas (cosmético) |
| RT-L-09 | Cycle guard bloqueia loops legítimos |

## Já registrados no backlog master (referência)

Este arquivo **não substitui** `docs/audits/master-audit/backlog.md` — apenas o complementa e prioriza sob a lente da Fase 1. Itens `F-0001..F-0007` e `R2-*` continuam válidos no seu documento de origem.
