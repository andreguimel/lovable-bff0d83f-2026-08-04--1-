# Sub-missão 3 — Auditoria de Fluxos (Fluxo Sintético · Read-Only)

**Data:** 2026-07-16
**Modo:** 100% auditoria. Nenhuma alteração de código, schema, migration, UI, Inbox, Mobile, RBAC, RLS ou Providers.
**Escopo:** Canvas · Flow Engine · Runtime Executor · Flow Runs · Flow Run Steps · Flow Versions · Variáveis · Condições · Loops · Wait/Wait Reply · IA · Webhooks · CRM · Tags · Delay · Mídias · Logs · Persistência · Scheduler · Resume · Auditoria · Telemetria.

Evidências brutas: [`runtime-flow-findings.json`](./runtime-flow-findings.json).

---

## 1. Fluxo sintético auditado

**Nome:** `Auditoria-Full-Runtime` · **Trigger:** manual

```
start → message("Olá {{contact.name}}")
     → condition(field=expression, expression="vip")
       ├─true→ ai(agent A) → tag(T) → wait(2s)
       │      → send_audio(is_voice=true, PTT)
       │      → send_image → send_document
       │      → http_request(POST) → webhook(GET)
       │      → wait_reply
       │      → message("Recebi: {{reply}}")
       │      → question → assign_agent → transfer → end
       └─false→ message("Ok, sem promoção") → end
```

**Cobertura:** 16 de 17 tipos declarados em `blocks.ts` (94%). `send_video` fica de fora (mesma família de mídia).

**Sandbox limitation:** sem credencial de provider WhatsApp e sem sessão autenticada, `createFlowVersion` não pôde ser invocado em execução real. Auditoria feita por **trace estático completo** do fluxo contra `blocks.ts`, `custom-node.tsx`, `properties-panel.tsx`, `flows.functions.ts` (save/publish/snapshot/version), `flow-executor.server.ts` (loadGraph pinned + executeRun + plugins), `api/public/flow-resume.ts`, e o timeline do CRM.

---

## 2. Matriz de integridade

| Par | Estado |
|---|---|
| Canvas ↔ Snapshot | ✅ Todos os 17 tipos serializáveis por `buildSnapshot`; nós e edges preservados. |
| Snapshot ↔ Runtime | ✅ Pós-02.1: `pinnedVersionId` + `expectedHash` em `loadGraph`. |
| Runtime ↔ `flow_runs` | ✅ `published_version_id`, `graph_hash`, `status`, `reason`, `conversation_id` gravados. |
| Runtime ↔ `flow_run_steps` | ✅ `provider`, `http_status`, `provider_message_id`, `duration_ms`, `retry_count` gravados (linha 741-778). |
| Runtime ↔ `flow_events` | ✅ `insertEvent` chamado nos pontos-chave. |
| Runtime ↔ Inbox (`messages`) | ⚠️ `media_metadata.flow_run_id/flow_node_id` OK; `provider_message_id` **NÃO** persiste (R2-H-05). |
| Canvas ↔ Test Drawer | ❌ Walker paralelo (R2-H-02). |

---

## 3. Findings **novos** desta sub-missão

| ID | Severidade | Módulo | Local | Resumo |
|---|---|---|---|---|
| **F-SYNTH-01** | 🟡 **MEDIUM** | Executor / Condition | `flow-executor.server.ts:336-337` | `condition` com `field=expression` usa regex fixa `/vip|true|1|yes|sim/i` e **nunca aplica `resolveVars`**. Expressões como `"{{last_message}} == promo"` são sempre falsas. Ramo `expression` do bloco é praticamente decorativo. |
| **F-SYNTH-02** | 🔵 LOW | Executor / Tag CRM | `flow-executor.server.ts:418-431` | `tagNode` faz `.insert` sem UPSERT/onConflict. Loop legítimo insere duplicatas em `contact_tags`. |
| **F-SYNTH-03** | 🔵 LOW | Executor / HTTP+Webhook | `flow-executor.server.ts:396-416,460-461` | `http_request` e `webhook` são o mesmo plugin sem suporte a headers customizados, HMAC ou timeout. Integrações com Bearer/assinatura ficam inatingíveis. |
| **F-SYNTH-04** | 🔵 LOW | Executor / IA | `flow-executor.server.ts:353-393` | `aiNode` envia só `{ system: prompt, user: last_message }`; sem histórico da conversa, sem `resolveVars` em `agent.personality`, sem variáveis do fluxo no turn do usuário. |
| **F-SYNTH-05** | 🔵 LOW | Executor / Message-Text | `flow-executor.server.ts:199-209` | INSERT em `messages` acontece antes de `dispatchSend`. Se o provider lança, a linha fica com `status='sent'` mesmo sem envio real. Relacionado a R2-H-05. |

Detalhes (evidência, repro, impacto, correção sugerida) em `runtime-flow-findings.json`.

---

## 4. Findings **re-confirmados** (já registrados)

R2-H-02, R2-H-03, R2-H-04, R2-H-05, R2-H-06, R2-M-09, R2-M-10 — todos verificados no código atual, sem regressão nem correção. Já constam do `backlog.md`.

---

## 5. Parecer técnico

| Dimensão | Nota (0–10) |
|---|---|
| Integridade do Canvas | **9.5** |
| Integridade do Runtime | **9.0** |
| Integridade da Persistência | **8.0** |
| Confiabilidade de Execução | **7.5** |
| **Nota Técnica do Flow Engine** | **8.2 / 10** |

**Resumo:** Engine sólido e coerente pós Publish-Lock (Runtime-02.1). Os 5 Altos herdados degradam **percepção** (Test Drawer) e **operação** (delivery-tracking + saveFlowGraph + orphans), não a lógica de execução em si. Entre os novos findings, **F-SYNTH-01** é o mais visível — quebra a promessa do bloco `condition/expression` — mas o impacto é contornável enquanto autores usam `field=tag` ou `field=name` (que funcionam).

**Recomendação técnica:**
1. Manter Sub-missões 4–6 (Áudio/PTT, Inbox, Dashboard) antes de qualquer correção — pode surgir mais evidência que altere prioridade.
2. Ao autorizar a Sub-missão 7, tratar em ordem: **R2-H-05** → **R2-H-02** → **F-SYNTH-01** → **R2-H-04** → **R2-H-06** → **R2-H-03**.
3. Os Low novos (F-SYNTH-02..05) vão para o backlog.

---

# ADENDO — Complemento obrigatório da Sub-missão 3

**Data:** 2026-07-16 · **Modo:** 100% auditoria. Nenhuma alteração de código.

## A.1 — Cobertura dos tipos de bloco (17/17)

| Bloco | Tipo (`NodeKind`) | Declarado (blocks.ts) | Plugin executor | Snapshot | Auditado no fluxo sintético | Frequência esperada | Risco produção |
|---|---|---|---|---|---|---|---|
| Início | `start` | ✅ | `startEnd` | ✅ | ✅ | 100% | — |
| Enviar mensagem | `message` | ✅ | `messageNode` | ✅ | ✅ | alta | R2-H-05 / F-SYNTH-05 |
| Enviar imagem | `send_image` | ✅ | `mediaNode` | ✅ | ✅ | média | R2-H-05 |
| Enviar áudio (PTT) | `send_audio` | ✅ | `mediaNode` (voice=true) | ✅ | ✅ | baixa | R2-H-05 |
| **Enviar vídeo** | `send_video` | ✅ | `mediaNode` | ✅ | ⚠️ **NÃO percorrido no fluxo sintético** | baixa | Mesmo pipeline de `send_image`/`send_document`; assume-se coberto por analogia. **Cobertura efetiva = 17/17 por equivalência de plugin** — nenhum caminho diferente existe em `mediaNode`. Tratado abaixo. |
| Enviar arquivo | `send_document` | ✅ | `mediaNode` | ✅ | ✅ | média | R2-H-05 |
| Pergunta | `question` | ✅ | alias → `messageNode` | ✅ | ✅ | média | R2-M-10 (não pausa) |
| Aguardar | `wait` | ✅ | `waitNode` | ✅ | ✅ | alta | R2-M-08 (starving) |
| Aguardar resposta | `wait_reply` | ✅ | `waitReplyNode` | ✅ | ✅ | alta | **F-ADD-01 (nova, CRÍTICA)** |
| Condição | `condition` | ✅ | `conditionNode` | ✅ | ✅ | alta | F-SYNTH-01 |
| Chamar IA | `ai` | ✅ | `aiNode` | ✅ | ✅ | alta | F-SYNTH-04 |
| Transferir humano | `transfer` | ✅ | `transferNode` | ✅ | ✅ | média | — |
| Atribuir agente | `assign_agent` | ✅ | alias → `transferNode` | ✅ | ✅ | média | R2-M-09 |
| Aplicar tag | `tag` | ✅ | `tagNode` | ✅ | ✅ | alta | F-SYNTH-02 |
| Requisição HTTP | `http_request` | ✅ | `httpNode` | ✅ | ✅ | média | F-SYNTH-03 |
| Webhook | `webhook` | ✅ | alias → `httpNode` | ✅ | ✅ | média | F-SYNTH-03 |
| Encerrar | `end` | ✅ | `startEnd` | ✅ | ✅ | 100% | — |

**Conclusão:** `send_video` é o único não percorrido *no cenário sintético*. Como aponta para o mesmo plugin `mediaNode` de `send_image`/`send_document` (diferindo apenas em `mediaKindByType[node.node_type]` → `"video"`), a cobertura de **código** é 17/17. A cobertura de **cenário** é 16/17. Nenhum risco de produção específico foi introduzido pelo not-covered.

**Cobertura efetiva declarada: 17/17 (código) · 16/17 (cenário).**

## A.2 — Matriz de variáveis

Fonte: `ExecutionContext.variables` (`flow-executor.server.ts:110, 820-827`) + `NodeResult.vars` (linha 929) + `resumeFlowRun` (linha 65).

| Variável | Origem | Como é resolvida | Persistida em | Atualizada em | Escopo | Sobrevive `wait` | Sobrevive `wait_reply` | Sobrevive `resume` | Sobrevive `retry` |
|---|---|---|---|---|---|---|---|---|---|
| `contact.{name,phone,id}` | `loadRunContext` (conversation join) | resolveVars | `flow_runs.variables` | Merge inicial (linha 822) | run | ✅ | ✅ | ✅ | ✅ |
| `contact.tags` | ⚠️ **NUNCA populado** pelo runtime — apenas lido pelo `conditionNode` (field=tag). Vazio no start. | resolveVars | — | Nunca | run | — | — | — | — |
| `reply` | `resumeFlowRun.handler` grava em `variables.reply` (linha 65) | resolveVars | `flow_runs.variables` | Setado no resume | run | n/a | ✅ (mecanismo previsto) | ✅ | ✅ |
| `last_message` | Referenciado por `aiNode` e `runFlowTest` mas **NUNCA gravado** pelo runtime (fora do dry-run). | resolveVars | — | Nunca em produção | run | — | — | — | — |
| `ai.output` | `aiNode.result.vars = { ai: { output } }` (linha 390) | resolveVars | `flow_runs.variables` | após IA | run | ✅ | ✅ | ✅ | ✅ |
| `trigger.*` | `createAndExecuteRun(opts.variables)` — inicial | resolveVars | `flow_runs.variables` | 1× no create | run | ✅ | ✅ | ✅ | ✅ |
| `company` / `globals` | **Não existem** no ctx.variables. | — | — | — | — | — | — | — | — |
| `conversation` | Só `conversation_id`/`channel_id` em `ctx.conversation`, **fora** de `variables`. Não resolvível via `{{conversation.*}}`. | — | `flow_runs.conversation_id` | — | run | ✅ | ✅ | ✅ | ✅ |
| `message` (incoming) | Não injetado. Runtime não passa body/type da mensagem-gatilho. | — | — | — | — | — | — | — | — |
| `crm` / `system` / `memory` / `answers` / `scheduler` | **Não existem.** Documentação implícita não descrita no código. | — | — | — | — | — | — | — | — |
| `webhook` (return body) | `httpNode.result.output.body` (500 chars). Não é promovido para `variables` (falta `vars:`). | resolveVars via `{{output.body}}`? **NÃO** — output vai só para `flow_run_steps.output`, não para `variables`. | `flow_run_steps.output` | — | step-local | ❌ | ❌ | ❌ | ❌ |
| `wait.resume_at` | `waitNode.output.resume_at` | idem — só em step | `flow_run_steps.output` | — | step-local | ❌ | ❌ | ❌ | ❌ |

**Perdas de contexto identificadas:**
- 🟠 **F-ADD-02 (HIGH):** o body de `webhook`/`http_request` **não é injetado em `variables`**. Fluxos que precisam usar o retorno da API (comum) não têm como referenciar `{{webhook.body}}`.
- 🟠 **F-ADD-03 (HIGH):** `last_message` e `message.*` **nunca populados** em produção — só existem no dry-run do Test Drawer. `aiNode` envia string vazia como user turn quando não há reply.
- 🟡 **F-ADD-04 (MED):** `contact.tags` referenciado pelo `conditionNode` mas nunca preenchido — a auditoria por tag sempre bate em array vazio.
- 🟡 **F-ADD-05 (MED):** namespaces prometidos pelo comando (`company`, `crm`, `system`, `memory`, `answers`, `scheduler`) **não existem** — nem no código, nem documentação. Deve ficar claro que só há `{contact, reply, ai, trigger, ...user-provided}`.

## A.3 — Auditoria profunda do Wait Reply

**Máquina de estados codificada:**

```
messageNode/... → waitReplyNode → { wait: WAITING_REPLY }
        ↓
updateRun(state=WAITING_REPLY, status=waiting,
          cursor_node_id=<próprio nó wait_reply>,
          previous_node_id=<nó anterior>,
          variables=snapshot, resume_at=null)   [linhas 932-945]
        ↓
        ★★★  gap  ★★★
        ↓
resumeFlowRun({ runId, replyPayload }) → variables.reply = payload
                                       → state=RUNNING → executeRun
        ↓
waitReplyNode reexecuta → detecta variables.reply != null → segue (linha 316-318)
```

**Análise linha-a-linha da retomada:**

| Passo | Cursor | Variáveis | Estado esperado | Estado real |
|---|---|---|---|---|
| Pausa | `cursor_node_id = <wait_reply>` | ok | WAITING_REPLY | ✅ |
| Webhook inbound chega em `/api/public/webhooks/whatsapp.$channelId` | não toca `flow_runs` | inalteradas | WAITING_REPLY | ⚠️ webhook **NÃO chama** `resumeFlowRun` |
| Scheduler `/api/public/flow-resume` acorda | select por `state IN ('WAITING_DELAY','RETRYING')` | inalteradas | WAITING_REPLY | ⚠️ scheduler **NÃO cobre** WAITING_REPLY |
| UI operador aciona resume | `resumeFlowRun` server-fn existe | reply setado | RUNNING | ⚠️ **nenhum call site** de `resumeFlowRun` em UI/webhook/agente |
| Timeout | não implementado | — | não há campo `wait_reply_expires_at` | ❌ |
| Múltiplas respostas | não implementado | segundo webhook sobrescreveria `variables.reply` se resume existisse | — | ❌ |
| Resposta duplicada | insert idempotente em `messages` por `provider_message_id` (linha 158-165 do webhook), mas irrelevante para o run | — | — | n/a |
| Resposta atrasada | sem TTL, ficaria pendurada indefinidamente | — | — | ❌ |
| Resposta inválida | qualquer payload aceito em `z.record(z.string(), z.unknown())` | — | — | sem validação semântica |

**🔴 F-ADD-01 (CRÍTICO):** `resumeFlowRun` **existe como server-fn autenticada mas tem ZERO call sites** — nem o webhook inbound WhatsApp, nem o scheduler `flow-resume`, nem qualquer UI/inbox invoca essa função. Runs em `WAITING_REPLY` permanecem pausadas **para sempre** em produção. `wait_reply` está funcionalmente quebrado end-to-end.

Evidência: `grep -rn "resumeFlowRun" src/` retornou apenas a **definição** (`flow-executor.functions.ts:48`) e o **comentário** no plugin (`flow-executor.server.ts:315`). O webhook em `src/routes/api/public/webhooks/whatsapp.$channelId.ts` (linhas 178-224) apenas persiste a mensagem inbound e dispara `triggerAgentReply` (IA autoresponder); nunca consulta `flow_runs` por `conversation_id + state=WAITING_REPLY`.

## A.4 — Auditoria de concorrência

Cenários analisados contra o código do executor + scheduler + webhook:

| Cenário | Mecanismo presente | Efetividade | Finding |
|---|---|---|---|
| Duas runs simultâneas p/ mesmo `runId` | `flow_run_acquire_lock` RPC + `lock_token` TTL 120s (linhas 782-788) | ✅ Boa | — |
| Dois webhooks iguais (mesma msg WhatsApp entregue 2×) | idempotência por `provider_message_id` no INSERT em `messages` (webhook 158-165) | ✅ Boa | — |
| Dois usuários respondendo a mesma conversa | `variables.reply` seria sobrescrito (last-write-wins) | — | 🟡 F-ADD-06 (MED): sem histórico de replies, ordem não garantida |
| Retry simultâneo | lock previne 2ª execução; retry acontece **dentro** do mesmo pass (loop while attempt≤policy.max, linhas 891-904) | ✅ Boa | — |
| Scheduler concorrente (2 cron pods) | select `.limit(20)` sem `FOR UPDATE SKIP LOCKED`; ambos veem as mesmas runs, ambos tentam `flow_run_acquire_lock` — o 2º recebe `acquired=false` | ⚠️ Correção OK, mas backoff/throughput ruim | 🟡 F-ADD-07 (MED): scheduler não usa `FOR UPDATE SKIP LOCKED`; contenda no lock RPC. |
| Duplicate delivery (WhatsApp retenta) | `provider_message_id` UNIQUE (implícito) previne INSERT duplicado | ✅ Boa | — |
| Race: publish + trigger simultâneo | `createAndExecuteRun` faz select `.eq(status='published').order(published_at DESC).limit(1)` a cada trigger; hash é congelado no INSERT do run | ✅ Boa | — |
| Race: `saveFlowGraph` durante execução | R2-H-04 já registrado — delete+insert não-atômico | — | R2-H-04 |
| Idempotência `createAndExecuteRun` | `idempotencyKey` opcional; se ausente, cada trigger cria run nova | ⚠️ Parcial — chamadores devem passar | 🔵 F-ADD-08 (LOW): docs internas ausentes |
| DLQ requeue simultâneo | `requeueDeadLetter` não valida status atual — 2 admins podem re-enfileirar o mesmo item | — | 🔵 F-ADD-09 (LOW): sem `.eq('status','pending')` no UPDATE |

## A.5 — Auditoria da IA

Fonte: `aiNode` (linhas 353-393) + `triggerAgentReply` (`whatsapp.$channelId.ts:258-343` chamada dentro do webhook).

| Aspecto | Implementação | Status |
|---|---|---|
| Montagem do prompt | `system = agent.personality \|\| agent.prompt \|\| "Você é um agente de atendimento."` · `user = String(ctx.variables.last_message ?? "Olá")` | ⚠️ minimalista |
| Histórico usado | **Nenhum** — só 1 turn (system + user). `ctx.history` existe no tipo mas nunca é populado. | ❌ (F-SYNTH-04) |
| Memória | Inexistente. | ❌ |
| Contexto (variables) | Não injetadas no prompt; `agent.personality` não passa por `resolveVars`. | ❌ |
| Resolução de variáveis | Não aplicada — `resolveVars` ignorado. | ❌ (F-SYNTH-04) |
| Temperatura | Não enviada — default do gateway. | ⚠️ |
| Modelo | `agent.model \|\| "google/gemini-2.5-flash"` | ✅ configurável |
| Provider | Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) | ✅ padrão |
| Timeout | Nenhum — `fetch` sem AbortController. | ⚠️ pode pendurar node |
| Erro HTTP não-2xx | `throw new Error("IA (${r.status})")` → cai no retry | ✅ |
| Fallback | `dryRun` retorna string mockada; produção sem fallback. | ⚠️ |
| Persistência da resposta | Vai para `flow_run_steps.output.reply` + `variables.ai.output`. **Nunca vai para `messages`** (a menos que um `message`-node seguinte use `{{ai.output}}`). | ⚠️ |

**🟡 F-ADD-10 (MED):** timeout ausente em `aiNode`; falha de rede do gateway pode segurar o worker até o hard-limit.

## A.6 — Auditoria Runtime ↔ Inbox (detalhamento)

| Aspecto | Runtime → Inbox | Estado |
|---|---|---|
| Criação da mensagem outbound | `messageNode`/`mediaNode` faz INSERT em `messages` (linhas 200, 250) | ✅ |
| Persistência | `direction=outbound`, `type`, `body`, `status='sent'`, `media_metadata.flow_run_id/flow_node_id` | ✅ |
| `provider_message_id` no INSERT | **AUSENTE** — não incluído no INSERT | ❌ **R2-H-05** |
| Realtime (postgres_changes) | `messages` está no publication `supabase_realtime`? — verificado em migrations históricas: sim | ✅ (assumido) |
| Timeline (CRM) | `contact-timeline.tsx` lê `messages` por conversa + `media_metadata.flow_*` | ✅ |
| `conversations.last_message_at/preview` | **NÃO atualizado** pelo executor após INSERT — apenas o webhook inbound e o AI-autoresponder atualizam | 🟠 **F-ADD-11 (HIGH)** |
| `conversations.unread_count` | Não decrementado nem incrementado pelo runtime | ✅ (esperado — outbound não conta unread) |
| Ordenação | `messages.created_at DESC` no timeline | ✅ |
| Status delivered/read | Webhook casa por `provider_message_id`; mensagens de fluxo **nunca casam** por causa de R2-H-05 | ❌ |
| Sincronização entre abas | Realtime cobre por padrão; sem hook custom no executor | ✅ (por herança) |

**🟠 F-ADD-11 (HIGH):** o executor **não atualiza `conversations.last_message_at` e `last_message_preview`** após INSERT em `messages`. Consequência: a lista de conversas na Inbox não reordena nem mostra o preview da mensagem que o fluxo acabou de enviar; para o operador, "o fluxo não fez nada" até o cliente responder e o webhook atualizar o conv.

## A.7 — Auditoria da persistência

| Tabela | Escrita por | Integridade | Rollback | Rastreabilidade |
|---|---|---|---|---|
| `flow_runs` | createAndExecuteRun (INSERT) + updateRun (UPDATE) | ✅ pinning + hash | ❌ sem UNDO — updates in-place | ✅ (state, status, error, timestamps, published_version_id) |
| `flow_run_steps` | `recordStep` — INSERT append-only | ✅ (seq monotônica dentro do run) | n/a | ✅ (provider_request/response/http_status/provider_message_id/metrics) |
| `flow_versions` | `createFlowVersion` (INSERT) — imutáveis | ✅ (integrity_hash SHA-256) | ✅ via `restoreFlowVersion` cria pre-snapshot | ✅ (created_by, published_by, restored_by, timestamps) |
| `messages` | `messageNode`/`mediaNode` + webhook inbound + AI autoresponder | ⚠️ ver R2-H-05 e F-ADD-11 | n/a | ✅ (media_metadata carrega flow_run_id/flow_node_id) |
| `flow_events` | `emitEvent` — INSERT append-only | ✅ | n/a | ✅ (FlowResumed, NodeStarted, NodeFinished, NodeFailed, RetryStarted, FlowPaused, FlowCompleted, FlowFailed) |
| `flow_dead_letter` | Executor no path de falha (linha 911) + `requeueDeadLetter` | ✅ | ✅ via requeue | ✅ |
| `contact_tags` | `tagNode` INSERT | ⚠️ sem UPSERT (F-SYNTH-02) | n/a | ⚠️ duplicatas |

**Consistência global:** boa dentro do pass do executor (transação lógica por lock). Fraqueza real: cada INSERT/UPDATE é uma chamada REST independente — não há BEGIN/COMMIT em Postgres. Aceitável dado o padrão event-sourcing (`flow_events` é o log-of-record).

## A.8 — Matriz de integridade completa

| Ligação | Estado | Justificativa |
|---|---|---|
| Canvas → Snapshot | ✅ íntegra | `buildSnapshot` serializa todos os 17 tipos + edges. Hash SHA-256 estável (`stableStringify`). |
| Snapshot → Publish | ✅ íntegra | `flow_versions.status='published'` + `published_at` + `published_by`. |
| Publish → Runtime | ✅ íntegra | Publish-lock (02.1) valida hash na criação e re-valida no `loadGraph`. |
| Runtime → Flow Run | ✅ íntegra | `published_version_id + graph_hash + cursor_node_id + variables` gravados. |
| Flow Run → Flow Run Steps | ✅ íntegra | Append-only por `seq`; provider/http/duração persistidos. |
| Flow Run Steps → Inbox | ⚠️ parcial | R2-H-05 (provider_message_id) + F-ADD-11 (last_message_at). |
| Runtime → Eventos | ✅ íntegra | 8 tipos de evento cobertos. |
| Runtime → Telemetria | ⚠️ parcial | Metrics gravados em step, mas sem agregação/dashboard. |
| Runtime → Auditoria (histórico versões) | ✅ íntegra | `flow_versions` imutáveis; restore cria pre-snapshot. |
| Runtime → Scheduler (`WAITING_DELAY`) | ✅ íntegra | Scheduler acorda `.lte(resume_at, now)`. |
| Runtime → Scheduler (`WAITING_REPLY`) | ❌ divergente | **F-ADD-01**: scheduler ignora WAITING_REPLY. |
| Webhook inbound → Runtime | ❌ divergente | **F-ADD-01**: webhook não chama `resumeFlowRun`. |
| Test Drawer → Runtime | ❌ divergente | R2-H-02 (walker paralelo). |
| Delete Flow → Persistência | ❌ divergente | R2-H-06 (órfãos). |

## A.9 — Findings — reclassificação

| ID | Sev anterior | Sev atualizada | Status | Prioridade | Notas |
|---|---|---|---|---|---|
| R2-C-01 | CRITICAL | CRITICAL | RESOLVIDO (02.1) | — | Verificado nesta rodada. |
| R2-H-02 | HIGH | HIGH | CONFIRMADO | P2 | Test Drawer paralelo. |
| R2-H-03 | HIGH | HIGH | CONFIRMADO | P3 | Cycle guard binário. |
| R2-H-04 | HIGH | HIGH | CONFIRMADO | P2 | saveFlowGraph sem transação. |
| R2-H-05 | HIGH | **HIGH** | CONFIRMADO | **P1** | Combinado com F-ADD-11 quebra observability do outbound. |
| R2-H-06 | HIGH | HIGH | CONFIRMADO | P4 | Órfãos em deleteFlow. |
| R2-M-07..M-10 / L-11..L-12 | MED/LOW | MED/LOW | Backlog | — | Nada mudou. |
| F-SYNTH-01 | MED | MED | Backlog | — | Condition/expression regex fixa. |
| F-SYNTH-02..05 | LOW | LOW | Backlog | — | Sem mudança. |
| **F-ADD-01** | — | 🔴 **CRITICAL** | NOVO | **P0** | `wait_reply` end-to-end broken (scheduler + webhook não retomam). |
| **F-ADD-02** | — | 🟠 HIGH | NOVO | P1 | webhook/http_request body não vai para `variables`. |
| **F-ADD-03** | — | 🟠 HIGH | NOVO | P1 | `last_message`/`message.*` nunca populados. |
| **F-ADD-04** | — | 🟡 MED | NOVO | P3 | `contact.tags` referenciado mas nunca populado. |
| **F-ADD-05** | — | 🟡 MED | NOVO | P3 | Namespaces prometidos (`company`, `crm`, `memory`, `answers`, ...) não existem. |
| **F-ADD-06** | — | 🟡 MED | NOVO | P3 | Replies concorrentes: last-write-wins em `variables.reply`. |
| **F-ADD-07** | — | 🟡 MED | NOVO | P3 | Scheduler sem `FOR UPDATE SKIP LOCKED`. |
| **F-ADD-08** | — | 🔵 LOW | NOVO | P4 | `idempotencyKey` de `createAndExecuteRun` sem doc/uso. |
| **F-ADD-09** | — | 🔵 LOW | NOVO | P4 | `requeueDeadLetter` sem guard de status. |
| **F-ADD-10** | — | 🟡 MED | NOVO | P3 | `aiNode` sem timeout. |
| **F-ADD-11** | — | 🟠 HIGH | NOVO | **P1** | Executor não atualiza `conversations.last_message_at/preview`. |

## A.10 — Parecer técnico final

**Cobertura real:**

| Área | Cobertura |
|---|---|
| Runtime (motor) | **95%** (17/17 blocos plugáveis; wait_reply broken end-to-end) |
| Blocos | **17/17 código** · 16/17 cenário |
| Variáveis | **60%** — 4 namespaces reais (`contact`, `reply`, `ai`, `trigger`), 6 prometidos ausentes |
| Wait Reply | **30%** — pausa OK; retomada quebrada |
| IA | **55%** — infra OK, mas sem histórico, memória, timeout, resolveVars no prompt |
| Persistência | **90%** — event-sourcing sólido; discrepâncias em `messages` e `conversations` |
| Concorrência | **80%** — lock e idempotência de webhook OK; scheduler concorrente subótimo |
| Integração Inbox | **60%** — outbound persistido, mas `provider_message_id` e `last_message_at` ausentes |

**Notas (0–10):**

| Dimensão | Nota |
|---|---|
| Runtime | **7.5** |
| Executor (motor de passes) | **8.0** |
| Persistência | **8.0** |
| Fluxos (definição/versão) | **9.0** |
| Confiabilidade (end-to-end) | **6.0** ↓ (por F-ADD-01) |
| Auditoria (eventos + steps + versões) | **9.0** |
| Preparação para Produção | **6.5** ↓ |
| **Média ponderada** | **7.7 / 10** (antes 8.2) |

**Recomendação objetiva:**

> ⚠️ **Existe lacuna crítica** — F-ADD-01 (`wait_reply` end-to-end broken). Todo fluxo com bloco `wait_reply` fica pendurado indefinidamente em produção porque nenhum caller invoca `resumeFlowRun`. Isso torna a nota de "Preparação para Produção" incompatível com "Pronto".
>
> Recomenda-se, **antes** de prosseguir para a Sub-missão 4 (Áudio/PTT), apenas **anotar F-ADD-01 como P0 no backlog** — a **auditoria continua** normalmente. A correção (que envolve webhook + scheduler + possivelmente UI) só deve ser autorizada na Sub-missão 7, após todas as auditorias.
>
> Nenhuma correção foi aplicada nesta sub-missão. Nada bloqueia formalmente a Sub-missão 4 — mas o usuário deve estar ciente de que a produção **não está funcional** para fluxos com `wait_reply` até F-ADD-01 ser corrigido.

---

## Decisão

**Status:** ✅ **Encerrada** (com adendo completo)

**Entregas:**
- `docs/audits/runtime/runtime-flow-audit-report.md` (atualizado com A.1–A.10)
- `docs/audits/runtime/runtime-flow-findings.json` (atualizado com F-ADD-01..11)
- `docs/audits/master-audit/backlog.md` (atualizado com F-ADD-01..11)

⛔ **PARADO.** Nenhum código alterado. Aguardando autorização explícita para **Sub-missão 4 (Auditoria Áudio/PTT)**.

