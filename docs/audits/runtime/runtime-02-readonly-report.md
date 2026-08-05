# Sub-missão 2 — Auditoria Runtime (Read-Only)

**Data:** 2026-07-16
**Modo:** 100% observacional. Nenhuma alteração de código, schema, migration, UI, RBAC, RLS, Event Bus ou Design System.
**Baseline:** Build ✅ · Typecheck ✅ · Tests 56/56 ✅ · Dep scan 0 high.

Este relatório **consolida e re-verifica** o estado atual dos findings da Runtime-02 original, considerando a correção aplicada pela Runtime-02.1 (Publish Lock). Evidências brutas em [`runtime-02-findings.json`](./runtime-02-findings.json). Os relatórios anteriores permanecem intocados em `runtime-02-report.md` e `runtime-02.1-report.md`.

---

## 1. Escopo verificado

| Área | Fonte | Estado |
|---|---|---|
| Runtime Engine (executor principal) | `src/lib/flow-executor.server.ts` (1099 LOC) | Verificado estaticamente |
| Server Functions do executor | `src/lib/flow-executor.functions.ts` (145 LOC) | Verificado |
| Flow Studio / persistência do grafo | `src/lib/flows.functions.ts` (1362 LOC) | Verificado |
| Flow Studio (leitura) | `src/lib/flow-studio.functions.ts` (168 LOC) | Verificado |
| Scheduler / Resume | `src/routes/api/public/flow-resume.ts` (44 LOC) | Verificado |
| Persistência (flow_runs / _versions / _run_steps / _events / _dead_letter) | schema + types.ts | Verificado |
| Providers WhatsApp | `src/lib/wa-providers/*` | Verificado (sem execução real — sandbox sem credenciais) |

Fases live-only (F5 áudio real, F9 inbox live, F10 status webhook end-to-end, F12 stress, F14 realtime multiaba, F15 Playwright completo) **não executadas** — exigem provider real. Registradas como deferidas.

---

## 2. Parecer executivo

| Severidade | Aberto | Resolvido neste ciclo |
|---|---|---|
| 🔴 Crítico | **0** | 1 (R2-C-01 via 02.1) |
| 🟠 Alto | **5** | 0 |
| 🟡 Médio | 4 | 0 |
| 🔵 Baixo | 2 | 0 |

**Recomendação técnica:** o requisito de contrato canvas ↔ runtime foi restaurado pela Runtime-02.1 (Publish Lock verificado nesta auditoria — `pinnedVersionId` + `expectedHash` ativos em `loadGraph`, `published_version_id`/`graph_hash` gravados em `createAndExecuteRun`). Restam **5 bugs Altos** documentados e reproduzíveis por leitura estática, que degradam confiança do Test Drawer, integridade de exclusão, delivery-tracking e resiliência do salvamento do grafo. Nenhum é regressão desta trilha — todos vinham da auditoria original. **Nenhum bug foi corrigido nesta sub-missão** (regra explícita: auditoria não gera correção).

---

## 3. Findings abertos (High)

Cada finding traz ID, severidade, módulo, arquivo:linha, evidência, causa raiz, impacto e proposta de correção — todos detalhados no JSON.

### 🟠 R2-H-02 — Test Drawer paralelo ao executor
- **Arquivo:** `src/lib/flows.functions.ts:479-731`
- **Evidência:** `runFlowTest` implementa walker próprio; não delega a `createAndExecuteRun({ dryRun: true })`.
- **Impacto:** Test Drawer pode aprovar comportamento que falha em produção (e vice-versa).
- **Correção proposta:** Unificar com o executor real (dryRun).

### 🟠 R2-H-03 — Cycle guard bloqueia loops legítimos
- **Arquivo:** `src/lib/flow-executor.server.ts:854, 866-872`
- **Evidência:** `visitedInPass = new Set<string>()` marca qualquer revisita como `FAILED` com mensagem `Loop detectado no nó X`.
- **Impacto:** Fluxos com re-entrada válida (menu → condição → menu) quebram em produção.
- **Correção proposta:** Contador por nó com teto configurável.

### 🟠 R2-H-04 — `saveFlowGraph` sem transação
- **Arquivo:** `src/lib/flows.functions.ts:207-278`
- **Evidência:** delete edges → delete nodes → insert nodes → insert edges, sem RPC transacional. Falha parcial deixa o fluxo zerado.
- **Impacto:** Perda de canvas em erro transitório.
- **Correção proposta:** RPC transacional ou UPSERT diferencial.

### 🟠 R2-H-05 — `messages.provider_message_id` continua não persistido
- **Arquivo:** `src/lib/flow-executor.server.ts:200-208` e `:250-267`
- **Evidência re-verificada:** o INSERT em `public.messages` acontece **antes** do `dispatchSend` e **não inclui `provider_message_id`**. O id retornado pelo provider é gravado somente em `flow_run_steps` (linha 759) e em `providerInfo` (219, 284), nunca em `messages`.
- **Impacto:** Webhook de status do WhatsApp casa por `provider_message_id` em `messages`; sem ele, `delivered`/`read`/`failed` **nunca fecham** para mensagens originadas de fluxos.
- **Correção proposta:** (a) reordenar dispatch antes do INSERT ou (b) manter INSERT + UPDATE por id após dispatch.

### 🟠 R2-H-06 — `deleteFlow` deixa órfãos
- **Arquivo:** `src/lib/flows.functions.ts:324-337`
- **Evidência:** Apaga apenas `flow_runs`, `flow_edges`, `flow_nodes`, `flows`. Não toca `flow_run_steps`, `flow_events`, `flow_dead_letter`, `flow_versions`. FK CASCADE dessas tabelas não confirmada.
- **Impacto:** Órfãos acumulam; dashboards contam histórico morto.
- **Correção proposta:** Migration `ON DELETE CASCADE` OU deletes explícitos.

---

## 4. Findings Médio/Baixo (backlog — já registrados)

R2-M-07, R2-M-08, R2-M-09, R2-M-10, R2-L-11, R2-L-12 — todos já constam do `docs/audits/master-audit/backlog.md`. **Nenhum novo item** identificado nesta re-auditoria; sem necessidade de atualizar o backlog.

---

## 5. Integridade Canvas ↔ Banco ↔ Runtime ↔ Executor

| Par | Estado | Observação |
|---|---|---|
| Canvas → Banco | ⚠️ Parcial | `saveFlowGraph` não é transacional (R2-H-04). |
| Banco → Runtime | ✅ | `executeRun` hidrata do snapshot pinado; hash validado. |
| Runtime → Executor | ✅ | Executor único em produção. |
| Test Drawer → Executor | ❌ | Walker paralelo (R2-H-02). |
| Delete → Persistência | ❌ | Órfãos possíveis (R2-H-06). |
| Executor → Providers → Inbox | ⚠️ | Envio OK; tracking de status quebrado (R2-H-05). |

---

## 6. Decisão

**Status:** ✅ **Encerrada**

Entregas:
- `docs/audits/runtime/runtime-02-readonly-report.md` (este documento)
- `docs/audits/runtime/runtime-02-findings.json` (atualizado com status)
- `docs/audits/master-audit/backlog.md` — **sem alterações** (findings já registrados)

Parecer final: **0 Críticos · 5 Altos · 4 Médios · 2 Baixos**. Nenhum bug corrigido nesta sub-missão. Correção dos 5 Altos exige autorização explícita da Sub-missão 7 (fluxo obrigatório: Auditoria → Evidência → Classificação → Autorização → Correção).

⛔ **PARADO.** Aguardando autorização explícita para a **Sub-missão 3 (Auditoria de Fluxos com fluxo sintético)**.
