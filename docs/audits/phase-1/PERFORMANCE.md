# PERFORMANCE.md

## Estado atual

Volume atual de produção é **muito baixo** (1 company, ~3 contacts, 102 messages, 23 flow_runs). Números aqui refletem tráfego de smoke tests + piloto interno, não carga real.

## Hotspots de seq_scan

| Tabela | seq_scan | idx_scan | Live rows |
|---|---:|---:|---:|
| `profiles` | **108.361** | 12.660 | 1 |
| `conversations` | 5.517 | 934 | 3 |
| `contacts` | 2.777 | 243 | 3 |
| `channels` | 2.620 | 401 | 2 |
| `flow_runs` | 1.633 | 429 | 23 |
| `user_roles` | 1.439 | 309 | 1 |
| `messages` | 1.382 | **2.512** | 102 |
| `flows` | 883 | 116 | 1 |
| `channel_events` | 854 | 163 | 13 |

**Leitura:** `profiles`/`user_roles`/`companies` são "seq scan-heavy" **por design** — tabelas minúsculas onde o planner ignora índice. Isso **não é problema** enquanto o tenant for pequeno. Quando `profiles` passar de ~500 linhas, o planner deve migrar para index scan sozinho.

Onde vale acompanhar:
- `conversations` e `flow_runs` — em produção real (milhares de rows), seq_scan alto vira problema.
- `messages` já usa índice (2.512 idx_scan > 1.382 seq_scan), OK.

## Índices ociosos

**30+ índices com `idx_scan = 0`** — esperado enquanto o produto está vazio. Reavaliar após 30 dias de piloto.

Casos que já sinalizam design questionável (mesmo em vazio):
- `feature_flags_company_id_key_environment_key` — unique composite pouco usado.
- `contact_enrichment_runs_unique_message` — dedup baseado em message_id; validar necessidade.
- `companies_slug_key` — se slug não é feature ativa, remover.

## Dead tuples

| Tabela | live | dead | Ratio |
|---|---:|---:|---|
| `channel_metrics_daily` | 5 | 42 | 8.4x |
| `conversations` | 3 | 38 | 12.7x |
| `flow_nodes` | 9 | 30 | 3.3x |
| `flow_runs` | 23 | 34 | 1.5x |
| `broadcast_recipients` | 3 | 3 | 1.0x |

Autovacuum funcional, mas frequência baixa por volume. Não impacta agora.

## Slow queries

`supabase--slow_queries` disponível mas não amostrado nesta auditoria (volume ainda insuficiente para EXPLAIN significativo). Rodar após 7 dias de piloto real.

## Bundle client

Auditoria anterior (`master-audit/backlog.md#F-0006`) identificou chunks server-side pesados (`recharts`, `xyflow`, `@ai-sdk`) — não impacta tempo do usuário porque não vão para o bundle client, mas afetam cold start do Worker.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| PERF-M-01 | Medium | Sem baseline de p50/p95 de server functions em produção. Existe `phase1-perf-baseline.md` de auditoria anterior — atualizar após piloto. |
| PERF-M-02 | Medium | Sem monitoramento contínuo de `pg_stat_statements` — Guardian não amostra queries lentas. |
| PERF-M-03 | Medium | Cold start do Worker SSR não medido (chunks server pesados). Backlog `F-0006`. |
| PERF-L-04 | Low | Índices ociosos — decisão pós-piloto. |

## Recomendações (backlog)

- **PERF-M-01/02** → após 7 dias de piloto: rodar `supabase--slow_queries` + `EXPLAIN` nas top 10. **Pós-piloto (7 dias)**.
- **PERF-M-03** → mover recharts/xyflow para import dinâmico client-side onde possível. **Pós-piloto**.

**Recomendação Fase 1:** performance **congelável**. Sem Critical/High. Sem carga real, otimizar seria prematuro.
