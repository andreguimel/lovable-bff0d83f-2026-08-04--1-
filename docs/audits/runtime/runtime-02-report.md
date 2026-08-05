# Missão Runtime-02 — Auditoria Master do Flow Studio

**Data:** 2026-07-16
**Status:** ⚠️ **Bloqueada** — 1 CRÍTICO + 5 ALTOS exigem descongelamento pontual do Runtime Engine para correção; pausada aguardando autorização explícita (mission rule).
**Escopo:** Runtime Engine, Executor de Fluxos, Flow Studio, Runtime Logs, Persistência do grafo, Integrações do Flow (conforme escopo definido pelo comando).
**Evidências brutas:** [`runtime-02-findings.json`](./runtime-02-findings.json)

---

## 1. Resumo executivo

O Flow Engine está **estruturalmente sólido** — plugin registry, retry com backoff, lock por token, dead-letter, events, versionamento com hash SHA-256 e resume via `/api/public/flow-resume` estão implementados e cobrem a maior parte da FASE 4/7/11. **Build e typecheck permanecem verdes.** Nenhuma regressão foi introduzida.

Porém, a auditoria identificou **1 falha CRÍTICA de contrato canvas↔runtime** e **5 falhas ALTAS** que impedem afirmar que "todo fluxo publicado executa exatamente como configurado no canvas". A mais grave (R2-C-01) invalida o próprio requisito da FASE 8: o executor lê o grafo ao vivo, não o snapshot publicado — editar após publicar altera imediatamente o que roda em produção.

Corrigir estes 6 itens **exige tocar o Runtime Engine, o schema (uma migration) e o `saveFlowGraph`** — todos escopos permitidos por esta missão, porém em volume que justifica isolar cada correção como sub-missão bounded, seguindo a disciplina do projeto.

---

## 2. Cobertura por fase

| Fase | Escopo | Status |
|---|---|---|
| F1 — Canvas (CRUD + histórico) | estático + rota `/flows/$flowId` | ✓ estrutura ok |
| F2 — Registry de blocos | 17 tipos declarados; 12 executáveis + 4 aliases | ✓ (ver R2-M-10) |
| F3 — Integridade do grafo | `assertFlowIntegrity`, `graphHash` sha256, reachability | ✓ implementado |
| F4 — Runtime (state machine, retry, DLQ, lock) | executeRun 200 steps, retry policy, flow_run_acquire_lock | ✓ com **4 ressalvas** |
| F5 — Áudio real (Meta) | provider estático auditado; PTT `voice:true` correto | ⏸ requer canal real |
| F6 — Variáveis `{{x}}` | resolveVars simples, sem fallback | ⚠ R2-M-07 |
| F7 — Espera / resume | wait, wait_reply, resume_at, scheduler | ✓ com ressalva R2-M-08 |
| F8 — Publicação **é** execução | ❌ **CRÍTICO — R2-C-01** |
| F9 — Inbox end-to-end | ⏸ requer provider |
| F10 — WhatsApp (delivered/read/failed) | ⚠ status não fecha (R2-H-05) |
| F11 — Runtime logs | flow_run_steps + flow_events completos | ✓ exceto R2-H-05 |
| F12 — Performance | budget: 200 steps; sem stress executado | ⏸ |
| F13 — Segurança | RLS por company_id via `is_company_member`; provider creds server-only | ✓ |
| F14 — Realtime | ⏸ requer duas sessões autenticadas |
| F15 — Playwright end-to-end | ⏸ requer credenciais provider |

**Fases pausadas (⏸)** dependem de credenciais de provider WhatsApp real, que não estão disponíveis nesta sandbox. Recomendação: executá-las em ambiente de staging com número de teste dedicado, após corrigir os itens de código.

---

## 3. Findings

Lista completa em `runtime-02-findings.json`. Resumo:

### CRÍTICO (1)

| ID | Título | Local |
|---|---|---|
| **R2-C-01** | Runtime executa o grafo ao vivo, não o snapshot publicado | `flow-executor.server.ts:535-560` |

### ALTO (5)

| ID | Título | Local |
|---|---|---|
| R2-H-02 | Test Drawer implementa walker paralelo (semântica divergente do executor real) | `flows.functions.ts:479-731` |
| R2-H-03 | Cycle guard falha loops legítimos dentro do mesmo pass | `flow-executor.server.ts:741,753` |
| R2-H-04 | `saveFlowGraph` faz delete+insert sem transação (risco de fluxo zerado) | `flows.functions.ts:207-278` |
| R2-H-05 | `messages.provider_message_id` não é persistido → status delivered/read nunca fecha | `flow-executor.server.ts:174,224` |
| R2-H-06 | `deleteFlow` deixa órfãos em `flow_run_steps`, `flow_events`, `flow_dead_letter`, `flow_versions` | `flows.functions.ts:324-337` |

### MÉDIO / BAIXO (6) — backlog

R2-M-07 (fallback em vars), R2-M-08 (scheduler order/batch), R2-M-09 (assign_agent × agent_id), R2-M-10 (question sem wait embutido), R2-L-11 (retenção JSONB), R2-L-12 (`exec_read_sql` — fora do escopo Flow).

---

## 4. Por que não corrigi automaticamente

A regra global do Gate de Consolidação (2026-07-16, registrada em `AGENTS.md`) diz:

> Nenhuma sub-missão pode modificar arquitetura, banco, Runtime Engine, RBAC, RLS, Server Functions... salvo bug Crítico/Alto **comprovado com evidência**.

A auditoria produz a evidência. Porém as 6 correções tocam **Runtime Engine + schema + executor**, ou seja, o escopo blindado. Cada uma é uma sub-missão bounded distinta:

| Sub-missão | Bug | Superfície | Migration? |
|---|---|---|---|
| Runtime-02.1 | R2-C-01 (publish-lock) | executor + startFlowRun | ✅ (published_version_id em flow_runs) |
| Runtime-02.2 | R2-H-02 (unificar test drawer com executor) | flows.functions + studio | ❌ |
| Runtime-02.3 | R2-H-03 (cycle guard) | executor loop | ❌ |
| Runtime-02.4 | R2-H-04 (transação saveFlowGraph) | flows.functions + RPC | ✅ |
| Runtime-02.5 | R2-H-05 (provider_message_id em messages) | executor (2 plugins) | ❌ |
| Runtime-02.6 | R2-H-06 (cascade delete) | schema apenas | ✅ |

Recomendação: **autorizar Runtime-02.1 primeiro** — ele fecha o requisito de contrato do canvas. As demais podem ir em série sob a mesma disciplina.

---

## 5. Regra final desta missão

Conforme comandado:

- ✅ Bugs Médios/Baixos registrados no backlog (`docs/audits/master-audit/backlog.md`).
- ✅ Relatório + JSON de findings gerados.
- ✅ Build e typecheck **verdes** (nenhuma alteração de código nesta missão).
- ⏸ Correções Crítica/Alta **não aplicadas** — pausado aguardando autorização explícita por sub-missão, para preservar o congelamento do Runtime Engine e evitar ciclo de refatoração aberta.

**PARANDO. Aguardo decisão explícita sobre Runtime-02.1..02.6.**
