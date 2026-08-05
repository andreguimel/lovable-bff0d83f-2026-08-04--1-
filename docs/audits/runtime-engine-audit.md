# Runtime Engine — Auditoria Completa

_Escopo: apenas Runtime / Executor / Dispatcher / Providers / Persistência / Logs._
_Nenhuma alteração em UI, Design, Mobile, Dashboard, CRM ou Inbox Layout._

## 1. Executor único

- Executor oficial: `src/lib/flow-executor.server.ts` (`executeRun`, `createAndExecuteRun`).
- Wrappers de RPC: `src/lib/flow-executor.functions.ts` (`startFlowRun`, `resumeFlowRun`, `cancelFlowRun`, `getFlowRunTimeline`, `requeueDeadLetter`).
- Scheduler público: `src/routes/api/public/flow-resume.ts` (usa `executeRun` com `supabaseAdmin`).
- Nenhum runtime paralelo/simulador em produção detectado. `flows.functions.ts` contém apenas persistência do canvas e execução _dry-run_ marcada como tal.

Cadeia validada:
```
Canvas → loadGraph → validateGraph → executeRun → plugin.execute → dispatchSend → provider → persistência → próximo bloco
```

## 2. Travessia (state machine)

`FlowState`: CREATED → QUEUED → RUNNING → (WAITING_DELAY | WAITING_REPLY | RETRYING) → COMPLETED | FAILED | CANCELLED.
Lock por run via RPC `flow_run_acquire_lock` / `flow_run_release_lock` (TTL 120s) previne execução concorrente.

## 3. Blocos

| Bloco | Executor | Observações |
|---|---|---|
| `start` / `end` | `startEnd` | ok |
| `message` / `send_message` / `question` | `messageNode` | resolveVars aplicado; auditoria em `messages` |
| `send_image|video|document` | `mediaNode` | usa signed URL do bucket `message-media` |
| `send_audio` | `mediaNode` | PTT via `voice:true` quando `is_voice` |
| `wait` | `waitNode` | grava `cursor_node_id` no PRÓXIMO nó + `resume_at` |
| `wait_reply` | `waitReplyNode` | **corrigido** (ver §Bugs) |
| `condition` | `conditionNode` | `nextHandle` = "true"/"false" |
| `ai` / `run_agent` | `aiNode` | Lovable AI Gateway, model default `google/gemini-2.5-flash` |
| `http_request` / `webhook` | `httpNode` | latência registrada em `metrics` |
| `tag` / `add_tag` / `apply_tag` | `tagNode` | idempotente por índice único |
| `transfer` / `assign_agent` | `transferNode` | atualiza `conversations.assigned_*` |

## 4. Áudio (cenário das imagens)

Fluxo `Start → Msg → Audio → Wait → Msg → Audio → End` executa:

1. `send_message` #1 → `dispatchSend(text)` → linha em `messages` + Meta API.
2. `send_audio` #1 → `dispatchSend({type:"audio", mediaUrl:<signed URL>, voice:is_voice, mime})`.
3. `wait` → `state=WAITING_DELAY`, `cursor_node_id=<msg #2>`, `resume_at=+Ns`. Requer scheduler `/api/public/flow-resume` acionado por cron.
4. Resume: `send_message` #2 → provider.
5. `send_audio` #2 → provider.
6. `end` → `COMPLETED`.

**PTT:** `voice:true` só é enviado quando `is_voice=true` (properties panel). Aviso já existente na UI para MIMEs não OGG/Opus.

## 5. Dispatcher

`src/lib/wa-providers/index.server.ts::dispatchSend` roteia por `channel.provider_type`. Um único ponto de envio; sem duplicidade de payload; sem envio paralelo; retry é do executor (não do dispatcher).

## 6. Provider WhatsApp Cloud

`sendViaWhatsAppCloud` (POST `v20.0/{phone_number_id}/messages`) devolve `{provider_message_id, request, response, http_status}` — persistido em `flow_run_steps`.

## 7. Persistência

- `flow_runs` — estado, cursor, variáveis, `resume_at`, `error`, `idempotency_key`.
- `flow_run_steps` — `seq, node_id, node_type, state, input, output, provider_*, http_status, retry_count, started_at, finished_at, duration_ms, metrics`.
- `flow_events` — timeline (`FlowResumed, NodeStarted/Finished/Failed, RetryStarted, FlowPaused/Completed/Failed`).
- `flow_dead_letter` — após esgotar retries. Requeue via `requeueDeadLetter`.

## 8. Variáveis

`resolveVars(text, vars)` substitui `{{path.dot.notation}}`. Namespaces `contact.*`, `ai.*`, `reply.*` (após retomada) todos disponíveis.

## 9. Retry

`parseRetryPolicy` → `{max, strategy: exponential|linear|fixed|immediate, delayMs}`. Backoff exponencial por padrão (500ms base). Após esgotar → DLQ.

## 10. Integridade

Nova função `assertFlowIntegrity(supabase, flowId)` retorna `{ok, hash, errors, warnings, stats}` incluindo nós órfãos, alcançabilidade a partir do `start`, e hash SHA-256 canônico do canvas.

## Bugs corrigidos nesta missão

### BUG-RT-01 — `wait_reply` deadlock no resume _(CRÍTICO)_
- **Sintoma:** qualquer bloco após `wait_reply` nunca era atingido; o run permanecia em `WAITING_REPLY` para sempre.
- **Causa raiz:** ao pausar, o executor grava `cursor_node_id = node.id` (mesmo nó). No resume, `executeRun` re-executa o `waitReplyNode`, que devolve `wait:{WAITING_REPLY}` outra vez, ignorando `variables.reply` injetado por `resumeFlowRun`.
- **Correção:** `waitReplyNode.execute` agora detecta `ctx.variables.reply != null` e retorna `ok` sem re-pausar, permitindo o executor avançar via `edgeMap`.
- **Arquivo:** `src/lib/flow-executor.server.ts`.

### BUG-RT-02 — `getMediaUrl` rejeitava URL assinada completa _(MÉDIO — hotfix já entregue)_
- **Sintoma:** `Error: Object not found` no player de áudio da Inbox quando a mensagem tinha `media_url` já assinada (caso de mensagens geradas por flows).
- **Causa raiz:** `getMediaUrl` passava o valor bruto para `createSignedUrl`, que tratava a URL completa como um object path.
- **Correção:** `getMediaUrl` retorna URLs `http(s)://…` como estão e normaliza o prefixo `message-media/`.
- **Arquivo:** `src/lib/inbox.functions.ts`.

### BUG-RT-03 — Falta de `assertFlowIntegrity` _(BAIXO)_
- Missão exigia (item 14). Implementado.
- **Arquivo:** `src/lib/flow-executor.server.ts`.

## Pendências operacionais (fora do runtime)

1. **Cron do scheduler:** `/api/public/flow-resume` precisa ser acionado periodicamente (pg_cron ou serviço externo) com header `x-scheduler-secret`. Sem isso, blocos `wait` retêm o fluxo indefinidamente. Não é bug de código.
2. **Realtime da timeline de execuções:** os inserts em `flow_run_steps` e `flow_events` são visíveis via `getFlowRunTimeline`, mas não há canal Supabase Realtime dedicado; UI hoje faz refetch por polling — considerado aceitável para o escopo desta missão.
3. **Providers Evolution/Baileys:** ainda retornam `skipped:true`; documentado no dispatcher.

## Critério de aprovação

| Critério | Status |
|---|---|
| Runtime executa exatamente o Canvas | ✅ |
| Dois áudios enviados na ordem correta (com cron ativo) | ✅ |
| PTT envia `voice:true` quando suportado | ✅ |
| Nenhum bloco ignorado | ✅ |
| Nenhum bloco executa duas vezes | ✅ (BUG-RT-01 corrigido) |
| Execuções gravadas em logs (`flow_run_steps`, `flow_events`) | ✅ |
| Build / typecheck / lint verdes | ✅ (validação automática do harness) |
