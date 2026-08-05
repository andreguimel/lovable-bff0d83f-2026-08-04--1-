# DATABASE.md

## Estado atual

- **69 tabelas** no schema `public`, todas com RLS ativo.
- **68 tabelas** têm pelo menos 1 policy; `scheduler_heartbeats` é a única exceção (acesso apenas via `service_role`).
- **54 migrations** aplicadas, todas com timestamp determinístico.
- Todas as tabelas seguem o padrão `id UUID`, `created_at`, `updated_at`, `company_id UUID` (quando multi-tenant).
- Trigger genérico `set_updated_at()` reutilizado em todas as tabelas mutáveis.

## Domínios

| Domínio | Tabelas principais |
|---|---|
| **Identidade** | `companies`, `profiles`, `user_roles`, `pending_invites`, `permissions`, `role_permissions_v2`, `member_permission_overrides` |
| **Inbox** | `conversations`, `messages`, `message_deletions`, `conversation_transfers`, `channels`, `channel_events`, `channel_metrics_daily` |
| **CRM** | `contacts`, `contact_notes`, `contact_tags`, `contact_tasks`, `contact_field_values`, `custom_fields`, `tags`, `contact_enrichment_*` (3) |
| **Flows** | `flows`, `flow_versions`, `flow_nodes`, `flow_edges`, `flow_runs`, `flow_run_steps`, `flow_events`, `flow_dead_letter` |
| **Agentes IA** | `ai_agents`, `ai_agent_runs`, `agent_prompt_versions`, `agent_knowledge_docs`, `agent_logs`, `agent_test_sessions` |
| **Broadcasts** | `broadcasts`, `broadcast_recipients` |
| **Cascatas** | `cascade_policies`, `cascade_runs`, `cascade_attempts` |
| **Time** | `team_*` (7 tabelas), `departments`, `job_titles`, `member_*` (3) |
| **Observabilidade** | `guardian_*` (3), `scheduler_heartbeats`, `domain_events`, `team_audit_log`, `team_entity_history` |
| **Configuração** | `feature_flags`, `plan_limits`, `subscriptions`, `notification_preferences`, `onboarding_progress`, `integrations`, `quick_replies`, `quick_reply_folders` |

## Top tabelas por tamanho (produção)

| Tabela | Tamanho | Linhas |
|---|---|---|
| `flow_events` | 296 kB | 204 |
| `guardian_runs` | 288 kB | 436 |
| `guardian_health_snapshots` | 288 kB | 424 |
| `flow_runs` | 264 kB | 23 |
| `scheduler_heartbeats` | 184 kB | 521 |
| `flow_run_steps` | 168 kB | 75 |
| `messages` | 168 kB | 102 |

Volume total do banco é **pequeno** (< 5 MB no schema `public`). Não há pressão de I/O.

## Pontos fortes

- **Padrão CREATE TABLE → GRANT → RLS → POLICY** respeitado em todas as migrations recentes.
- **RLS por `company_id`** universalmente aplicado via `is_company_member()` / `current_company_id()`.
- Funções `SECURITY DEFINER` com `search_path` fixo (`SET search_path TO 'public'`).
- **`has_permission`** implementa cascata correta: override → role → admin default. Testado em `user_roles` + `role_permissions_v2` + `member_permission_overrides`.
- **`handle_new_user`** já cobre convite via `pending_invites` + fallback solo signup.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| DB-H-01 | **High** | `public.exec_read_sql` (SECURITY DEFINER) usa parser textual (`position('insert ' in lower_sql)`) — bypassável por comentários SQL ou aspas. Já registrado em `master-audit/backlog.md#R2-L-12`, mas o impacto real é **High** (função é `to authenticated`). |
| DB-H-02 | **High** | `guardian_health_snapshots`/`guardian_runs` crescem sem retenção (~848 linhas em produção mínima). Sem TTL vai crescer indefinidamente. |
| DB-H-03 | **High** | `flow_events` e `flow_run_steps` também sem retenção (`R2-L-11` no backlog master, escalar para High). |
| DB-M-04 | Medium | `n_dead_tup > n_live_tup` em `flow_runs` (34/23), `conversations` (38/3), `channel_metrics_daily` (42/5), `flow_nodes` (30/9). Autovacuum funcional mas frequência baixa por volume. Sem impacto agora, ficar de olho. |
| DB-M-05 | Medium | 30+ índices com `idx_scan = 0` — normal em fase de piloto vazio, mas convém revalidar após 30 dias de produção real. |
| DB-M-06 | Medium | Extensões no schema `public` (`R2/F-0005` do backlog master) — melhor prática pede schema `extensions`. Não bloqueante. |
| DB-L-07 | Low | `companies.slug_key` sem uso (`idx_scan = 0`) — pode ser removido se slug não for feature ativa. |

## Evidências

Ver seções acima. Comandos usados:
- `pg_stat_user_tables` para hotspots e dead tuples.
- `pg_stat_user_indexes` para índices ociosos.
- `pg_policies` para contagem de policies por tabela.

## Recomendações (backlog)

- **DB-H-01** → substituir parser por `pg_parse_query` / lista branca de statements, ou revogar `EXECUTE` para `authenticated` e mover chamadas para server function autenticada. **Antes do piloto público**.
- **DB-H-02/03** → agendar job `pg_cron` diário para deletar registros > 30 dias em `guardian_health_snapshots`, `guardian_runs`, `flow_events`, `flow_run_steps`, `scheduler_heartbeats`. **Pós-piloto (30 dias)**.
- **DB-M-04..07** → pós-piloto.

**Recomendação Fase 1:** banco **estável e congelável**. Único risco que merece atenção **antes** do piloto público é **DB-H-01** (exec_read_sql).
