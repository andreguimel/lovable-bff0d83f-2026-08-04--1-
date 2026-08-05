# RELATÓRIO MESTRE DO PROJETO

> Documento consolidado read-only, gerado sem alteração de código, banco, runtime ou providers.
> Fonte: leitura estática do repositório, auditorias oficiais em `docs/audits/**`, backlog master, memória de projeto e banco de produção (`information_schema`).
> Data de emissão: 2026-07-17.

---

## 1. Resumo Executivo

| Campo | Valor |
|---|---|
| Nome do projeto (repo / branding) | `tanstack_start_ts` / **Zenda** (publicado como `talkebase.lovable.app`) |
| Objetivo do sistema | Plataforma SaaS omnichannel para atendimento e automação de conversas: Inbox multi-canal (WhatsApp Cloud), CRM, Fluxos com Runtime próprio, Agentes de IA, Guardian de saúde, RBAC multi-tenant. |
| Estado atual | **Core v1.0 CONGELADO** · **Piloto WebMarcas em execução** · Modo Observação Operacional |
| % concluído (estimado) | **~88% do escopo v1.0** (Core + Inbox Grupo A · Grupos B/C/D do roadmap INBOX-UX-01 pendentes) |
| Versão de referência | RC3.1 (congelamento) + Fase 1 (Core Foundation) + Fase 1.5A/1.5B (Hardening) + Fase 2.0 Estágio 1 (Auditoria Inbox) |
| Ambiente | Piloto (produção real com 1 tenant — WebMarcas) |
| Data da última alteração relevante | 2026-07-17 (última migration `20260717033253_...sql`) |
| Último commit | Gerenciado internamente pela Lovable (não exposto ao agente) |
| Última missão executada | **Fase 2.0 · Estágio 1 — Auditoria Read-Only do Inbox** (aprovada, sem correções) |
| Última fase concluída | **Fase 2.0 · Estágio 1** (encerrada em modo observação) |

---

## 2. Linha do Tempo (Fases)

### Fase 0 — Bootstrap RC1/RC2
- **Objetivo:** validar prontidão do produto para RC1/RC2.
- **Feito:** `mission-01`, `mission-02.1`, `mission-02.2`, mobile (`mission-mobile-01..06.4`), enrichment (fases 1–3), inbox-delete (fases 1–4), runtime-01.
- **Aprovado:** RC1 validado (`rc1-validation-report.md`), RC2 pronto para produção (`rc2-production-readiness-report.md`).
- **Pendências:** dívidas registradas em `docs/audits/master-audit/backlog.md`.
- **Arquivos:** `docs/audits/master-audit/*`, `docs/audits/inbox-delete-*`.

### Fase RC3 — Gate de Consolidação
- **Objetivo:** congelar plataforma em RC3.1 antes do piloto.
- **Feito:** consolidação visual (`docs/design/rebrand-v2-report.md`, `rc3-visual-polish-report.md`), gate de consolidação (`mission-gate-consolidation-report.md`), veredito de produção (`production-verdict.md`).
- **Resultado:** RC3.1 CONGELADO. Governança "evidência antes de código" ativada.
- **Data:** consolidada até 2026-07-16.

### Missão INBOX-UX-01 — Grupo A (Paridade WhatsApp Web)
- **Objetivo:** elevar paridade do Inbox 48% → 66% via 5 ações operacionais.
- **Feito:**
  - **A1 · Copiar texto** — `INBOX-UX-01-A1-copy-report.md`
  - **A2 · Responder/Quote** — persistência `reply_to_id` + `context.message_id` em Cloud (`INBOX-UX-01-A2-reply-report.md`)
  - **A3 · Encaminhar** — `forwardMessages` (lote 20×20) (`INBOX-UX-01-A3-forward-report.md`)
  - **A4 · Informações da mensagem** — `getMessageInfo` + `MessageInfoSheet` (`INBOX-UX-01-A4-message-info-report.md`)
  - **A5 · Fixar Conversas** — `pinned_at` + limite 3 por empresa (`INBOX-UX-01-A5-pin-report.md` + `-final-report.md` + `-regression-report.md`)
- **Aprovado:** Grupo A completo. Paridade estimada **~70,5%**.
- **Pendente:** Grupos B, C, D (roadmap `INBOX-UX-01-roadmap.md`). Teto viável Cloud = 91%.

### Missão CRITICAL-01 — Runtime + Inbox
- **Objetivo:** corrigir 3 críticos (publicação inconsistente, execução incompleta, scroll do Inbox).
- **Resultado:** validação de publicação, `validateGraphForPublish`, `ResizeObserver` no Inbox. Ver `CRITICAL-01-runtime-inbox-report.md`.

### Missão FLOW-RUNTIME-ROOTCAUSE
- **Objetivo:** eliminar "Fluxo não possui versão publicada" em disparo pelo Inbox.
- **Resultado:** unificação de `transferConversation` no runtime canônico. Fluxo mínimo Start→Msg→End provado end-to-end.
- **Arquivos:** `FLOW-RUNTIME-ROOTCAUSE-report.md`, `-proof-report.md`.

### Missão RUNTIME-CANONICAL-ENFORCEMENT
- **Objetivo:** provar convergência de todos os call sites para `createAndExecuteRun`/`executeRun`.
- **Resultado:** matriz de origens 100% canônica. `runFlowTest` isolado como dry-run.
- **Arquivo:** `RUNTIME-CANONICAL-ENFORCEMENT-report.md`.

### Missão RUNTIME-PARITY (Simulador × Produção)
- **Objetivo:** provar paridade fluxo 9 nós Playground × Inbox.
- **Resultado:** run `2837e72e-...` executado 9 nós, `state=COMPLETED`, WAIT retomado por `pg_cron` em <2s. Zero código alterado.
- **Arquivo:** `RUNTIME-PARITY-mission-report.md`.

### Fase 1 — Core Platform Foundation (Auditoria Read-Only)
- **Objetivo:** mapear plataforma, gerar fonte única de verdade, decidir se Core pode ser congelado.
- **Feito:** 10 documentos em `docs/audits/phase-1/` (ARCHITECTURE, DATABASE, RUNTIME, SECURITY, API, EVENTS, STORAGE, PERFORMANCE, OBSERVABILITY, OPERATIONS) + backlog priorizado + recommendation.md.
- **Aprovado:** Core **congelável**. Zero Critical. 13 High registrados.
- **Data:** 2026-07-17.

### Fase 1.5A — Hardening Pré-Piloto
- **Objetivo:** fechar High de segurança.
- **Feito:** SEC-H-01 (`exec_read_sql` blindada — regex + `SET LOCAL transaction_read_only=on`); SEC-H-03 (Password HIBP ligado).
- **Arquivo:** `phase-1.5A-hardening-report.md`.

### Fase 1.5B — Operational Readiness
- **Objetivo:** habilitar operação real.
- **Feito:** Guardian External Alerter (webhook Slack/Discord, rate-limit, dedup); 4 documentos operacionais (`RUNBOOK`, `INCIDENT_RESPONSE`, `DISASTER_RECOVERY`, `ONCALL`) em `docs/ops/`; 5 testes vitest do alerter.
- **Arquivo:** `phase-1.5B-operational-readiness-report.md`.

### Piloto WebMarcas — P0 (em curso)
- **Modo:** operação. Sem novas features. Só Critical/High com evidência.
- **Estado:** ativo desde consolidação Fase 1.5B.

### Fase 2.0 — Omnichannel Inbox · Estágio 1 (Auditoria Read-Only)
- **Objetivo:** matriz de bugs classificada, sem tocar código.
- **Feito:** relatório `PHASE-2.0-inbox-audit-report.md` com 20 casos, 8 achados (F-01..F-08), veredito "funcionalmente pronto".
- **Decisão do usuário:** aprovado + **modo observação**. Nenhuma correção autorizada.
- **Data:** 2026-07-17.

---

## 3. Missões (índice por status)

| Missão | Objetivo | Status | Evidência |
|---|---|---|---|
| mission-01 | Auditoria mestre inicial | Encerrada | `master-audit/mission-01-report.md` |
| mission-02.1 / 02.2 | Follow-ups auditoria | Encerradas | `mission-02.*-report.md` |
| mission-mobile-01..06.4 | Cobertura mobile | Encerradas | `mission-mobile-*-report.md` |
| mission-enrichment-01 (P1–P3) | Enriquecimento de contatos | Encerrada | `mission-enrichment-01-phase*.md` |
| mission-inbox-delete-01 (P1–P4) | Exclusão de mensagens | Encerrada | `mission-inbox-delete-*` + `docs/audits/inbox-delete-final.md` |
| mission-runtime-01 | Auditoria runtime inicial | Encerrada | `mission-runtime-01-report.md` + `runtime-engine-audit.md` |
| runtime-02 / 02.1 / 02.2 / 02.3 | Iterações runtime (wait-reply, scheduler recovery) | Encerradas | `docs/audits/runtime/*` |
| mission-consolidation-01 | Baseline consolidação | Encerrada | `mission-consolidation-01-baseline-report.md` |
| mission-gate-consolidation | Gate RC3.1 | Encerrada — CONGELAMENTO | `mission-gate-consolidation-report.md` |
| RC1 / RC2 | Prontidão release | Encerradas | `rc1-validation-report.md`, `rc2-production-readiness-report.md` |
| INBOX-UX-01 A1..A5 | Grupo A de paridade | Encerradas · Grupo A completo | 6 relatórios `INBOX-UX-01-A*` |
| CRITICAL-01 | 3 críticos runtime/inbox | Encerrada | `CRITICAL-01-runtime-inbox-report.md` |
| FLOW-RUNTIME-ROOTCAUSE | Bug crítico versão publicada | Encerrada | `FLOW-RUNTIME-ROOTCAUSE-report.md` + proof |
| RUNTIME-CANONICAL-ENFORCEMENT | 100% canônico | Encerrada | `RUNTIME-CANONICAL-ENFORCEMENT-report.md` |
| RUNTIME-PARITY | Simulador × Produção | Encerrada | `RUNTIME-PARITY-mission-report.md` |
| Fase 1 | Auditoria Core | Encerrada — Aprovada | `docs/audits/phase-1/*` |
| Fase 1.5A | Hardening segurança | Encerrada — Aprovada | `phase-1.5A-hardening-report.md` |
| Fase 1.5B | Readiness operacional | Encerrada — Aprovada | `phase-1.5B-operational-readiness-report.md` |
| Fase 2.0 · Estágio 1 | Auditoria Inbox | Encerrada — Modo observação | `PHASE-2.0-inbox-audit-report.md` |

Nenhuma missão ativa no momento.

---

## 4. Funcionalidades

| Módulo | % Concluído | Status | Observações |
|---|---|---|---|
| Auth (Login / cadastro / invite / OAuth Google) | 95% | Produção | HIBP ativo; RLS via `has_role` |
| Usuários / Perfil / Team | 90% | Produção | Departamentos, filas, presença, org chart |
| RBAC / Permissões | 95% | Produção | `role_permissions_v2`, `has_role` SECURITY DEFINER, matriz por membro |
| CRM (contatos, tags, notas, tarefas, custom fields) | 88% | Produção | Views: lista, cards, kanban; import CSV; enrichment |
| Inbox (conversas, composer, mídias) | 85% | Piloto | Grupo A concluído; Grupos B/C/D pendentes; cold-load ~9s (F-01 backlog) |
| WhatsApp Cloud (provider) | 90% | Piloto | Envio/recebimento, reply nativo, forward, áudio, imagem, documento |
| WhatsApp Baileys / Evolution | 0% | Fora escopo v1.0 | Roadmap alerta teto 95–96% se migrar |
| Facebook / Instagram / Email (canais) | 0% | Não iniciado | UI de canais suporta, provider não |
| Fluxos (Studio + Runtime) | 92% | Produção | Runtime canônico, WAIT via pg_cron, DLQ, tracing |
| Runtime Engine | 95% | Congelado | Validado em RUNTIME-PARITY |
| IA (Agentes, Playground, nó `ai` em fluxo) | 88% | Produção | AI Gateway Lovable, versões de prompt, knowledge docs |
| Guardian (saúde, incidentes, alerter externo) | 92% | Produção | Score 100, webhook Slack/Discord ativo |
| Dashboard (widgets) | 80% | Produção | KPI row, inbox live, activity timeline, guardian health, AI summary |
| Agenda / Team Schedules | 60% | Parcial | Estrutura em `team_schedules`, UI limitada |
| Canais (config) | 90% | Produção | Formulário, QR, sparkline, drawers |
| Campanhas / Broadcasts | 85% | Produção | Wizard, status, mobile actions sheet |
| Cascatas (retry/policy) | 85% | Produção | `cascade_policies`, `cascade_runs`, cron tick |
| Analytics / Reports (Broadcasts, Cascades, Conversations) | 78% | Produção | Rotas dedicadas + mobile |
| Financeiro / Pagamentos | 0% | Não iniciado | Sem Stripe/Asaas integrados |
| Configurações (feature flags, audit, guardian, APIs) | 85% | Produção | Painéis dedicados |
| API pública (webhooks, cron, health) | 90% | Produção | 9 rotas em `src/routes/api/public/` |
| Mobile (todos módulos) | 85% | Produção | Auditorias completas: mobile-audit, mobile-campaigns, mobile-channels |
| Storage (buckets) | 85% | Produção | 4 buckets privados, sem lifecycle |
| Onboarding | 70% | Produção | `onboarding_progress` + checklist |
| Quick Replies | 90% | Produção | Folders + replies |
| Notificações | 60% | Parcial | `notification_preferences` estrutura, UI parcial |

---

## 5. Arquitetura

**Stack:** TanStack Start v1.168 + React 19 + Vite 7 + TypeScript strict + Tailwind v4 + shadcn/ui. Deploy edge (Cloudflare Workers). Backend Lovable Cloud (Supabase gerenciado). Router file-based em `src/routes/`.

**Camadas principais:**
- `src/routes/` — 33+ rotas, file-based, layout `_authenticated`.
- `src/routes/api/public/` — 9 endpoints HTTP (webhooks WhatsApp, cron cascade, flow-resume, guardian-cron, health, live, ready, metrics).
- `src/lib/` — server functions (`*.functions.ts`), server-only (`*.server.ts`), domínios (flows, inbox, crm, guardian, runtime, events, pipeline, dashboard, di, contracts, config, features, observability, plugins, health, query, enrichment).
- `src/components/` — UI por domínio (inbox, crm, agents, flows, campaigns, channels, dashboard, mobile, team, guardian, reports, settings).
- `src/integrations/supabase/` — clientes auto-gerados (client, client.server, auth-middleware, auth-attacher, types).

**Tecnologias-chave:**
- TanStack Router + Query · Zod · React Hook Form · @xyflow/react (Flow Studio) · Framer Motion · Recharts · @dnd-kit · AI SDK (OpenAI, Anthropic, Google) · date-fns · sonner · cmdk · qrcode.

**Runtime:** módulo próprio (`src/lib/runtime/*` + `flow-executor.*`). Executor canônico: `createAndExecuteRun` (novo) e `executeRun` (retomadas). WAIT persistido em `flow_runs.resume_at`, retomado por `pg_cron` chamando `/api/public/flow-resume`. Steps em `flow_run_steps`. Falhas em `flow_dead_letter`.

**Event Bus:** `flow_events` (9 tipos determinísticos), `domain_events` (planejado, sem consumidores ativos).

**Scheduler:** `pg_cron` para WAIT resume e cascade tick. Heartbeats em `scheduler_heartbeats`.

**Guardian:** monitora incidents (`guardian_incidents`), snapshots de saúde (`guardian_health_snapshots`), runs (`guardian_runs`). Alerter externo (`guardian-alerter.server.ts`) com webhook + rate-limit + dedup.

**Providers:** `sendViaWhatsAppCloud` (Meta Graph API). Webhook inbound em `/api/public/webhooks/whatsapp.$channelId`. Providers `mock` para testes.

**APIs:** 263 server functions (`createServerFn`) + 9 rotas HTTP públicas.

---

## 6. Banco de Dados

- **Tabelas `public`:** **69** (validado em Fase 1 e confirmado via `information_schema` — 69 relações listadas).
- **Migrations:** **55 arquivos** em `supabase/migrations/` (2026-07-13 → 2026-07-17).
- **RLS:** ativo em todas as 69 tabelas; 68 com pelo menos 1 policy.
- **GRANTs:** padrão uniforme (SELECT/INSERT/UPDATE/DELETE para `authenticated`; ALL para `service_role`; `anon` só onde política permite).

**Tabelas principais:**
- **Core:** `companies`, `profiles`, `user_roles`, `permissions`, `role_permissions_v2`, `member_permission_overrides`.
- **CRM:** `contacts`, `contact_tags`, `tags`, `contact_notes`, `contact_tasks`, `custom_fields`, `contact_field_values`, `contact_enrichment_*`.
- **Inbox:** `conversations`, `messages`, `channels`, `channel_events`, `channel_metrics_daily`, `conversation_transfers`, `message_deletions`, `quick_replies`, `quick_reply_folders`.
- **Flows:** `flows`, `flow_versions`, `flow_nodes`, `flow_edges`, `flow_runs`, `flow_run_steps`, `flow_events`, `flow_dead_letter`.
- **AI:** `ai_agents`, `ai_agent_runs`, `agent_prompt_versions`, `agent_test_sessions`, `agent_knowledge_docs`, `agent_logs`, `member_agents`.
- **Team:** `departments`, `job_titles`, `team_queues`, `team_queue_members`, `team_schedules`, `team_presence`, `team_audit_log`, `team_entity_history`, `team_member_profiles`, `member_channels`, `member_tags`, `pending_invites`.
- **Guardian/Observability:** `guardian_incidents`, `guardian_health_snapshots`, `guardian_runs`, `scheduler_heartbeats`, `domain_events`.
- **Broadcasts/Cascades:** `broadcasts`, `broadcast_recipients`, `cascade_policies`, `cascade_runs`, `cascade_attempts`.
- **Feature/Onboarding:** `feature_flags`, `onboarding_progress`, `notification_preferences`, `integrations`, `subscriptions`, `plan_limits`, `company_usage_current_month`.

**Índices:** compostos por `company_id` + ordenação (ex: `idx_conversations_pinned_order`). Backlog nota ~30 índices ociosos (DB-M-05).

**RLS pattern:** função `has_role(user_id, role)` SECURITY DEFINER; policies por `company_id` derivadas de `profiles`.

---

## 7. Runtime

**Como funciona:**
1. Trigger (Inbox `transferConversation`, webhook inbound, API) → `createAndExecuteRun(flowId, context)`.
2. Resolve `published_version_id` (validado — bug crítico corrigido em FLOW-RUNTIME-ROOTCAUSE).
3. Loop principal percorre `flow_nodes` do grafo persistido. Cada step registra em `flow_run_steps` + emite `flow_events`.
4. Nós suportados: `start`, `message`, `send_audio`, `send_image`, `send_file`, `wait`, `question`, `ai`, `condition`, `assign_agent`, `transfer`, `end`.
5. Nó `wait` grava `resume_at` em `flow_runs.state='WAITING'` e sai. `pg_cron` chama `/api/public/flow-resume` a cada 30s.
6. Retomada usa `executeRun`, com lock otimista para evitar dupla execução.
7. Falhas capturadas → `flow_dead_letter` com contexto para replay.
8. Grafos órfãos (nó folha não-`end`) sinalizam `FlowCompletedWithoutEnd`.

**Locking:** update condicional em `flow_runs.state` (RUNNING→WAITING/COMPLETED).
**Retry:** cascade separada; runtime em si não tem retry automático além do resume.
**DLQ:** `flow_dead_letter`. Zero itens em produção no momento da última leitura.
**Validação:** RUNTIME-PARITY comprovou paridade Simulador × Produção em run de 9 nós.

---

## 8. Integrações

| Integração | Status |
|---|---|
| **WhatsApp Cloud (Meta Graph)** | **Implementado** — envio (texto, áudio, imagem, doc, vídeo, reply nativo), webhook inbound (`/api/public/webhooks/whatsapp.$channelId`), ack de status |
| **WhatsApp Baileys/Evolution** | Não implementado (fora do escopo v1.0) |
| **Facebook / Instagram** | Não implementado |
| **Email inbound/outbound** | Não implementado (existe `email-ai.functions.ts` para IA em email, mas sem provider) |
| **Lovable AI Gateway** | **Implementado** — usado em agentes e nós `ai` de fluxo. Suporta OpenAI/Anthropic/Google via AI SDK |
| **OpenAI direto** | Disponível via AI SDK (não é caminho preferido; Gateway é o padrão) |
| **Meta (Graph API)** | Implementado (parte do provider WhatsApp Cloud) |
| **Asaas** | Não implementado |
| **Stripe** | Não implementado |
| **Supabase (Lovable Cloud)** | **Implementado** — DB, Auth, Storage, Realtime, pg_cron |
| **Storage (buckets)** | **Implementado** — `message-media`, `agent-knowledge`, `avatars`, `contact-files` (todos privados) |
| **Guardian External Alerter** | **Implementado** — webhook Slack/Discord configurável |

---

## 9. IA

- **Gateway:** Lovable AI Gateway (chat, imagem, embeddings) sem chaves do usuário.
- **Onde é usada:**
  - Nó `ai` em fluxos — gera resposta contextual usando prompt do agente.
  - Playground em Studio (`mobile-playground.tsx`, `src/components/agents/studio/*`).
  - Widget `ai-summary` no dashboard.
  - Enrichment de contatos (`enrichment.functions.ts`).
  - `email-ai.functions.ts` (estrutura preparada).
  - `AI FAB` no perfil CRM (`ai-fab.tsx`).
- **Agentes:**
  - `ai_agents` — configuração base.
  - `agent_prompt_versions` — versionamento de prompt.
  - `agent_knowledge_docs` — RAG.
  - `agent_test_sessions` — testes com histórico.
  - `agent_logs` — telemetria por execução.
  - `member_agents` — atribuição por membro.
- **Contexto:** conversa atual, contato, empresa, custom fields, memória de execução do fluxo.
- **Ferramentas:** o nó `ai` em fluxo aceita variáveis interpoladas (`{{contact.name}}`, etc.).

---

## 10. Guardian

- **Monitora:**
  - Runtime (flow_runs stuck, DLQ crescente).
  - Realtime (registry errors).
  - Slow queries.
  - Erros de UI capturados por boundary.
  - Heartbeats do scheduler.
- **Detecção:** cron periódico + reporter em runtime (`guardian-reporter.ts`).
- **Health Score:** 0–100 calculado por snapshots (`guardian_health_snapshots`).
- **Incidentes:** severidade Low/Medium/High/Critical em `guardian_incidents`.
- **Alertas externos:** `guardian-alerter.server.ts` dispara webhook (Slack/Discord) para High/Critical com rate-limit e dedup por fingerprint.
- **Logs:** `guardian_runs` (histórico de execução do cron).
- **UI:** `/guardian` (desktop + mobile), widget `guardian-health` no dashboard.

---

## 11. Segurança

- **Auth:** Supabase Auth (email/senha + OAuth Google), Password HIBP Check ativo (SEC-H-03).
- **RBAC:** roles em `user_roles` (nunca em `profiles`); `has_role()` SECURITY DEFINER; matriz `role_permissions_v2`; overrides por membro.
- **RLS:** ativo em 100% de `public`; policies por `company_id` derivado de `profiles`.
- **Policies:** cada tabela user-facing tem SELECT/INSERT/UPDATE/DELETE para `authenticated`; políticas por role para escopos administrativos.
- **Criptografia:** TLS em trânsito; secrets em Lovable Cloud (não expostos ao cliente).
- **Auditoria:** `team_audit_log`, `team_entity_history`, `EntityHistoryTimeline` no UI.
- **exec_read_sql:** blindada em SEC-H-01 (regex de sanitização + `SET LOCAL transaction_read_only=on`).
- **Buckets:** todos privados; URLs assinadas via `getMediaUrl`.

---

## 12. Performance

Baseline (Fase 2.0 Estágio 1):
- **Cold-load Inbox (desktop):** ~9.070 ms (F-01 · High · backlog observação).
- **Envio de mensagem:** dentro do esperado (não medido isoladamente).
- **WAIT resume:** <2s após `resume_at` (RUNTIME-PARITY).
- **DLQ:** 0.
- **Guardian score:** 100.

**Gargalos conhecidos (backlog):**
- Cascata de server-fns no boot do Inbox (F-01).
- `supabase.auth.getUser()` chamado 7× por render (F-01).
- N+1 em `getMediaUrl` (F-05).
- Slow queries: não observadas em piloto atual.

**Índices ociosos:** ~30 candidatos a remoção pós-piloto (DB-M-05).

---

## 13. Testes

- **Playwright (E2E):**
  - Suite planejada em `tests/e2e/inbox/` (não instalada — auditorias usaram scripts pontuais em `/tmp/browser/`).
  - `e2e/` na raiz com `test_guardian.py`, `report.json`, `run.sh` (Python + Playwright).
  - `tests/audit/nav-audit.py` — auditoria de navegação.
- **Unitários (Vitest):** 5 testes do Guardian Alerter (Fase 1.5B).
- **Integração:** testes de contratos ausentes (API-M-03 no backlog).
- **Cobertura:** parcial. Sem métrica agregada.
- **Scripts de gate:** `scripts/phase1-gate.ts`, `scripts/rc1-gate.ts`, `scripts/master-audit.ts`, `scripts/validate-migration.ts`.

---

## 14. Bugs

| Bug | Severidade | Status |
|---|---|---|
| F-01 · Cold-load Inbox ~9s | High (métrica) | Backlog observação (sem gatilho operacional) |
| F-02 · Realtime `postgres_changes after subscribe` histórico | Medium | Corrigido; incidents antigos apenas |
| F-03 · Imagens/documentos não exercidos no piloto | Medium | Sem ação (aguardar uso real) |
| F-04 · Pin não exercido (0 conversas fixadas) | Low | Sem ação |
| F-05 · N+1 em `getMediaUrl` | Medium | Backlog |
| F-06 · Incidents High órfãos (bundle antigo) | Medium | Monitorar |
| F-07 / F-08 · Fora escopo Fase 2 | Medium/Low | Backlog |
| RT-H-01 · `provider_message_id` NULL em placeholders | High | Sub-missão isolada quando necessário |
| RT-H-02 · Órfãos em `deleteFlow` | High | Pós-piloto |
| RT-H-03 · `saveFlowGraph` sem transação | High | Pós-piloto |
| DB-H-02/03, EVT-H-01 · Retenção `guardian_*` / `flow_events` | High | Pós-piloto (30 dias) |
| ARCH-H-01 · 43 arquivos no topo de `src/lib/` | High (organização) | Pós-piloto |

**Zero Critical aberto.**

---

## 15. Backlog

Referências: `docs/audits/phase-1/backlog.md`, `docs/audits/master-audit/backlog.md`.

**High (13 itens):** SEC-H-01✅, SEC-H-02, SEC-H-03✅, OBS-H-01✅, OBS-H-02, OPS-H-01✅, OPS-H-02, RT-H-01, RT-H-02, RT-H-03, DB-H-02, DB-H-03/EVT-H-01, ARCH-H-01.

**Medium (~20 itens):** ARCH-M-02/03, DB-M-04/05/06, SEC-M-04/05, API-M-01/02/03, EVT-M-02/03/04, ST-M-01/02, PERF-M-01/02/03, OBS-M-03/04/05, OPS-M-03/04/05, RT-M-04/05/06/07.

**Low (~12 itens):** ARCH-L-04, DB-L-07, SEC-L-06, API-L-04, EVT-L-05, ST-L-03/04, PERF-L-04, OBS-L-06, OPS-L-06, RT-L-08/09.

**Grupos B/C/D do INBOX-UX-01:** paridade 66% → 79% → 89% (teto Cloud 91%).

**Módulos não iniciados v1.0:** Facebook/Instagram/Email providers, Financeiro/Pagamentos, Agenda completa, Notificações UI.

---

## 16. Documentação

Estrutura em `docs/`:
- `README.md`, `architecture.md`, `state-model.md`, `module-conventions.md`, `module-template.md`, `rbac.md`, `errors.md`, `migrations.md`, `cache-policy.md`, `perf-budget.md`, `release-checklist.md`.
- `adr/` — 5 ADRs (RBAC, Service Container, Event Versioning, Execution Pipeline, Error Catalog).
- `audits/` — Fase 1 (10 docs), Fase 2 (auditoria Inbox), Inbox (12 relatórios INBOX-UX-01 + Critical + Runtime), Master (28 arquivos), Runtime (10 arquivos), Scroll (3 arquivos), baseline.
- `design/` — component-inventory, design-system-v2, rc3-visual-polish-report, rebrand-v2-report, visual-consistency-report.
- `hotfixes/` — BUG-CHANNELS-001, BUG-INBOX-CONVERSATION-MENU-CRITICAL, BUG-INBOX-MENU-AUDIT.
- `mobile/` — 4 auditorias (audit, campaigns, channels, improvements).
- `ops/` — DISASTER_RECOVERY, INCIDENT_RESPONSE, ONCALL, RUNBOOK.
- `runtime/` — scheduler-operations.

Total estimado: 80+ arquivos de documentação.

---

## 17. Estado Atual

**O projeto hoje está em PILOTO com Core CONGELADO.**

- ✅ **Core v1.0:** congelado (RC3.1 + Fase 1 + Fase 1.5A/B).
- 🚀 **Piloto WebMarcas:** operação real, 1 tenant.
- 👀 **Modo:** observação operacional — sem missões abertas.
- ⛔ **Roadmap:** congelado para novas funcionalidades.
- 📋 **Gatilhos para reabrir dev:** (1) relato de operador com impacto; (2) regressão reproduzível; (3) alerta novo do Guardian; (4) degradação de métricas com impacto comprovado. Métrica isolada NÃO é gatilho.

Todo desenvolvimento pós-Fase 1.5B foi bloqueado por decisão de governança. O foco é preservar estabilidade do Core e colher evidências reais.

---

## 18. O que falta para concluir o sistema

### Fase 2 — Omnichannel Inbox (parcial)
- Estágio 2: correções autorizadas por evidência (não iniciadas).
- Grupo B (INBOX-UX-01): +13pp paridade — Selecionar múltiplas + Marcar como não lida + Arquivar + Silenciar + Info da conversa.
- Grupo C: +10pp paridade — Encaminhar múltiplas mídias, Reagir, Buscar dentro da conversa.
- Grupo D: +10pp paridade — Chamada, Status, Comunidades (limitações Cloud).
- Suite Playwright persistente em `tests/e2e/inbox/`.

### Fase 3 — Multi-Canal
- Provider Facebook/Instagram (Meta Business).
- Provider Email (envio/recebimento com IA).
- Provider SMS (opcional).
- Roteamento por canal em `channels`.

### Fase 4 — Monetização
- Integração Stripe / Asaas.
- Enforcement de `plan_limits`.
- Billing dashboard.
- Faturas.

### Fase 5 — Escala Multi-Tenant Pública
- Retenção `guardian_*` e `flow_events` (30d).
- Reorganização `src/lib/` em subdomínios (ARCH-H-01).
- Adoção de `AppError` em 100% das server fns (API-M-02).
- Contratos Zod unificados (API-M-01).
- Testes de contrato `/api/public/*` (API-M-03).
- Dashboard consolidado de saúde (OBS-H-02).
- Staging separado (OPS-M-04).
- DR documentado com RPO/RTO (OPS-M-05).
- Remoção de índices ociosos (PERF-L-04 / DB-M-05).

### Fase 6 — v1.0 Completa
- Notificações UI (push/email/in-app).
- Agenda completa.
- Onboarding guiado end-to-end.
- Marketplace/plugins (`src/lib/plugins` está preparado).
- Domain events com subscribers (EVT-M-02/04).

---

## 19. Próxima missão recomendada

**Recomendada:** **Encerrar oficialmente o Piloto WebMarcas com um relatório de encerramento** (`docs/audits/phase-2/PHASE-2.0-closure-report.md`) após 2–4 semanas de operação real, consolidando:
- Métricas reais medidas (não simuladas).
- Eventuais gatilhos válidos que surgiram.
- Decisão go/no-go para Fase 2 Estágio 2 (correções) ou Fase 3 (multi-canal).

**Justificativa:** o projeto está em standby por decisão explícita do usuário. Qualquer missão de desenvolvimento sem gatilho válido viola a governança vigente. A ação de maior valor agora é converter a operação real em evidência estruturada — isso é auditoria, respeita o standby, e habilita a próxima decisão baseada em fatos.

**Não executar sem autorização.**

---

## 20. Avaliação Geral

- **Percentual REAL concluído:** **~88% do escopo v1.0** (Core + Inbox básico + Grupo A). Se v1.0 exigir Fase 3+4 (multi-canal + monetização), cai para **~65%**.
- **Pronto para produção?** **Sim, para o piloto controlado atual (1 tenant, canal WhatsApp Cloud único).** Não recomendado para abertura pública multi-tenant sem tratar High restantes (retenção, provider_message_id, órfãos em deleteFlow, monetização).
- **O que impede produção pública:**
  1. Ausência de billing/limites enforçados.
  2. Retenção de tabelas de observabilidade não implementada.
  3. Multi-canal apenas WhatsApp Cloud.
  4. Cold-load do Inbox (~9s) friccional em massa.
  5. Suite E2E persistente não instalada.
- **Maiores riscos:**
  1. Crescimento não controlado de `flow_events`/`guardian_*` sem retenção (30+ dias).
  2. Dependência única de Meta Cloud como provider.
  3. Ausência de staging separado (deploys diretos).
  4. `exec_read_sql` — mitigado, mas continua sendo uma superfície SECURITY DEFINER.
- **Maiores pontos fortes:**
  1. Runtime canônico validado end-to-end (RUNTIME-PARITY).
  2. RLS + RBAC consistente em 100% do schema.
  3. Governança "evidência antes de código" documentada e respeitada.
  4. Guardian com alerter externo real, dedup e rate-limit.
  5. Zero Critical aberto; zero DLQ.
  6. 80+ documentos de auditoria/design/ops — histórico auditável.
  7. Arquitetura moderna (TanStack Start + edge deploy + Lovable Cloud) sem tech debt estrutural.

---

**Fim do Relatório Mestre.**
