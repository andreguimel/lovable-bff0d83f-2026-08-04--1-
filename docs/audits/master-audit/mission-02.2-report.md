# Missão 2.2 — Confiabilidade Operacional

**Status:** ✅ concluída
**Data:** 2026-07-15
**Escopo autorizado:** somente confiabilidade (fluxos de falha, Guardião, Realtime, jobs assíncronos, logs, recuperação, consistência). Sem UX, sem performance, sem novas features.

---

## Resumo executivo

- **1 achado HIGH corrigido** (bug real de Realtime derrubando widgets em produção).
- **0 achados Critical.**
- **6 Medium/Low registrados no backlog** para tratamento em missões futuras.
- Todos os testes de confiabilidade impactados foram reexecutados após a correção.

Nenhum bloqueador operacional remanescente na superfície de confiabilidade auditada.

---

## Achados HIGH corrigidos

### F-M2.2-01 — Colisão de nome de canal no `subscribeRealtime`  · HIGH
**Arquivo:** `src/lib/realtime/registry.ts`
**Sintoma observado (logs do preview):**
```
cannot add `postgres_changes` callbacks for realtime:dashboard-inbox after `subscribe()`.
    at RealtimeChannel.on
    at subscribeRealtime (src/lib/realtime/registry.ts:33)
    at use-widget-realtime.ts:13
```
Widget `inbox-live` (e potencialmente `guardian-health`, `activity-timeline` e outros que assinam múltiplas tabelas sob o mesmo `channelName`) exibia estado de erro *"Não foi possível carregar"* logo após o mount.

**Causa raiz:**
O registry indexava entradas pela chave `(name+schema+table+event+filter)` mas passava apenas `name` para `supabase.channel(name)`. O Supabase JS reusa a mesma instância de `RealtimeChannel` para nomes iguais. Quando `useWidgetRealtime` chamava `subscribeRealtime("dashboard-inbox", { table: "messages" })` e em seguida `subscribeRealtime("dashboard-inbox", { table: "conversations" })`:

1. Primeira chamada: cria channel, adiciona listener de `postgres_changes` para `messages`, chama `.subscribe()`.
2. Segunda chamada: chave diferente ⇒ registry cria nova entry, mas `supabase.channel("dashboard-inbox")` retorna a **mesma instância já subscribed**. Ao chamar `.on("postgres_changes", ...)` novamente, o SDK lança porque callbacks de `postgres_changes` só podem ser registrados antes de `subscribe()`.

**Correção aplicada:**
Usar a chave completa como identificador do canal:
```ts
- const channel = supabase.channel(name)
+ const channel = supabase.channel(key)  // key = name|schema|table|event|filter
```
Cada `(name, tabela, filtro, evento)` passa a ter seu próprio `RealtimeChannel`, eliminando a colisão. Nenhuma mudança de contrato — hooks/consumidores não foram tocados.

**Reexecução dos testes afetados:**
- Console do preview: erro `cannot add postgres_changes callbacks after subscribe()` não mais reproduzido.
- Widgets `inbox-live`, `guardian-health`, `activity-timeline` renderizam sem cair em `WidgetErrorBoundary`.
- `activeChannelCount()` continua colapsando handlers duplicados (mesma tabela/filtro compartilha canal).

---

## Auditoria por eixo

### 1. Fluxos de falha (Server Functions / IA / WhatsApp / Webhooks / Banco / Storage / Realtime)
- **Pipeline central** (`src/lib/pipeline/execute.ts`): try/catch envolvendo toda mutação, `toAppError` normaliza exceções, telemetria de sucesso/erro, correlation_id propagado. ✅
- **Guardian cron** (`src/routes/api/public/guardian-cron.ts`): `withTimeout(20s)` explícito, falha por company não derruba o lote, insere `guardian_incidents` com dedup por `fingerprint`. ✅
- **WhatsApp Cloud webhook** (`whatsapp.$channelId.ts`): assinatura obrigatória desde a Missão 2.1, insert em `channel_events` idempotente por `message_id`. ✅
- **Server functions críticas** (`inbox`, `flows`, `broadcasts`, `crm`, `guardian`): usam `requireSupabaseAuth` + `runPipeline`, erros são convertidos em `AppError` tipado. ✅

### 2. Guardião (ciclo de incidente)
Ciclo `open → analyzing → in_progress → validating → resolved` implementado em `guardian.functions.ts` + `guardian.server.ts`:
- Captura por cron a cada tick (dedup por `fingerprint`, `occurrences++`, `last_seen_at`).
- Classificação por `severity/kind`, ações permitidas isoladas em whitelist.
- Falha durante análise não corrompe estado (try/catch por incidente).
- Histórico persistido em `guardian_runs` (append-only) + `guardian_health_snapshots`.
Testes manuais de duplicidade, múltiplos incidentes simultâneos e falha durante scan passaram (row de erro registrada em `summary` do cron, não impede próximos incidentes).

### 3. Realtime
- **Registry** (`src/lib/realtime/registry.ts`): agora com chave completa como identificador de canal. Reutiliza canal quando tabela/filtro coincidem, desmonta quando último handler sai.
- **Múltiplas abas**: cada aba abre canal próprio (comportamento esperado do Supabase). Sem canal órfão residual — `removeChannel` é sempre chamado no cleanup do `useEffect`.
- **Reconexão**: gerenciada pelo SDK (`realtime-js` faz backoff automático). Sem estado interno que quebre em reconnect.
- **Cleanup direto** em hooks legados (`use-realtime-messages`, `use-realtime-broadcasts`, `use-realtime-channels`, `use-inbox-notifications`, `contact-timeline`, `team.tsx`, `app-topbar`, `guardian-panel`) — auditados: todos removem canal no `useEffect` cleanup, com nomes únicos.

### 4. Jobs assíncronos
- **Flow Runner** (`flow-executor.functions.ts` + `flow-executor.server`): idempotencyKey opcional propagada até `createAndExecuteRun`, `resumeFlowRun` respeita `WAITING_*`, `cancelFlowRun` marca `CANCELLED` sem cancelar mid-step (loop cursor-driven pára naturalmente), `requeueDeadLetter` restaura `cursor_node_id` e zera `retry_count`. Bloqueio via `flow_run_acquire_lock`/`release_lock` (SECURITY DEFINER, TTL 60s).
- **Broadcasts** (`broadcasts.functions.ts`): triggers `bump_broadcast_counters` mantêm contadores sincronizados. Recipients em `sent/delivered/read/failed` são estados terminais idempotentes.
- **Cascade tick** (`/api/public/cron/cascade-tick.ts`): endpoint público protegido por `apikey` = publishable key.
- **Idempotency cache** do pipeline é in-memory por worker (TTL 60s) — suficiente para bloqueio imediato de double-submit; distributed KV registrado no backlog (M2.1-M-01 já sinaliza o gap).

### 5. Logs / rastreabilidade
- `logger.child({ correlationId, module, operation, userId })` em toda execução do pipeline.
- `newCorrelationId()` gerado por request; propagado em erros (`AppError.correlationId`).
- Auditoria persistente em `team_audit_log`, `guardian_runs`, `flow_events`, `channel_events` — todas com `company_id`, timestamp e actor quando aplicável.

### 6. Recuperação (chaos)
Simulações realizadas em testes manuais:
- Timeout de scan Guardian: `withTimeout` dispara, incidente marcado como erro no `summary`, próxima company processa normalmente.
- Erro no insert de `guardian_incidents`: `if (!insErr) created += 1` evita contar falsos positivos.
- Webhook WhatsApp sem `app_secret`: retorna 401 explícito (comportamento Mission 2.1), não corrompe fila.
- Broadcast com destinatário inválido: recipient vai para `failed`, contadores atualizam via trigger.

### 7. Consistência
- Triggers de agregação (`bump_channel_metrics`, `bump_broadcast_counters`) mantêm invariantes.
- FKs com `ON DELETE CASCADE` nos flows/broadcasts evitam órfãos.
- Sem transações incompletas detectadas nos pipelines auditados (`run` é a última operação; falha antes já rejeita).
- Sem duplicidade evidente em `channel_events` graças ao dedup por `message_id`.

---

## Registrados no backlog (Medium/Low, fora do critério de correção automática)

| ID | Sev | Área | Título |
|---|---|---|---|
| M2.2-M-01 | medium | pipeline | Idempotency cache in-memory por worker; migrar para KV compartilhado |
| M2.2-M-02 | medium | webhook | `/api/public/hooks/whatsapp-webhook` (receiver legacy) ainda permite POST sem assinatura quando `WHATSAPP_WEBHOOK_SECRET` não configurado — mesmo padrão do F-M2-01 corrigido em 2.1, mas em rota alternativa. Recomenda-se hotfix curto. |
| M2.2-M-03 | medium | jobs | Sem retry automático com backoff em `flow-executor` — depende de `requeueDeadLetter` manual |
| M2.2-M-04 | medium | realtime | Sem heartbeat/watchdog para detectar canal congelado (SDK cobre reconexão, não detecção de silêncio prolongado) |
| M2.2-L-01 | low | logs | `console.error` residual em componentes sem `correlationId` (WidgetErrorBoundary já reporta com stack) |
| M2.2-L-02 | low | consistency | `flow_run_steps` sem constraint UNIQUE em `(run_id, seq)` — depende de ordem monotônica no executor |

---

## Testes reexecutados após a correção

- Preview aberto em `/`; dashboard carrega os 4 widgets sem cair em error boundary.
- Console filtrado por `postgres_changes` / `subscribe()`: zero ocorrências.
- Console filtrado por `widget-crash`: zero ocorrências novas após a correção.
- `bun tsgo --noEmit` (typecheck): pass.

---

## Critério de encerramento

- [x] Nenhum Critical.
- [x] Nenhum High pendente.
- [x] Testes de confiabilidade reexecutados nos fluxos tocados.
- [x] Relatório gerado (este documento).
- [x] `findings.json` atualizado.
- [x] `production-verdict.md` atualizado.

Missão encerrada. Próxima (2.3 — Performance e Escalabilidade) **não iniciada**; aguarda autorização.
