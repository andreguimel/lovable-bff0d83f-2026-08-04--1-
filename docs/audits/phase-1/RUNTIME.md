# RUNTIME.md

## Estado atual

O Runtime Engine do Zenda foi consolidado nas missões **RUNTIME-CANONICAL-ENFORCEMENT** e **RUNTIME-PARITY** (encerradas). Existe **uma única fonte de verdade**:

- `src/lib/flow-executor.server.ts` — motor real (`createAndExecuteRun`, `executeRun`, `resolveVars`, cycle guard).
- `src/lib/flow-executor.functions.ts` — entry point RPC.
- `src/lib/flow-resume-inbound.server.ts` — retomada por mensagem recebida.
- `src/routes/api/public/flow-resume.ts` — retomada agendada (WAIT/timer) chamada pelo scheduler.

## Modelo de execução

```
Trigger (inbound msg | manual | broadcast | scheduler)
        │
        ▼
createAndExecuteRun()   ← cria flow_run (state=CREATED) + resolve versão publicada
        │
        ▼
executeRun()            ← loop de nós, respeitando cycle guard e concorrência
        │
        ├── emite flow_events (NodeStarted / NodeFinished / RuntimeGraphResolved / …)
        ├── grava flow_run_steps (append-only, com seq)
        ├── acquire/release lock via flow_run_acquire_lock (TTL 60s)
        │
        ├── nós síncronos (send_text, send_media, message, transfer, assign, IA…)
        │   → executa e continua
        │
        ├── nó WAIT
        │   → persiste resume_at + estado, marca state=PAUSED
        │   → retorna; job `pg_cron` chama /api/public/flow-resume periodicamente
        │
        └── END
            → state=COMPLETED + FlowCompleted event
```

## Pontos fortes

- **Runtime único**: `createAndExecuteRun` + `executeRun` são o **único** caminho — sem executores paralelos, sem drift Playground↔produção (validado em RUNTIME-PARITY).
- **Locking pessimista** via `flow_run_acquire_lock` (função SQL SECURITY DEFINER) evita dupla execução por race entre webhook e scheduler tick.
- **Append-only** em `flow_run_steps` e `flow_events` — auditabilidade completa.
- **Versionamento**: `flow_versions` + `next_flow_version_number` — cada publicação vira snapshot imutável.
- **Dead letter queue**: `flow_dead_letter` isola runs com falha irrecuperável (3 policies).
- **Scheduler heartbeats**: `scheduler_heartbeats` (521 linhas em 24h) confirma o cron ativo.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| RT-H-01 | **High** | `provider_message_id` fica NULL nas mensagens inseridas pelo executor quando o canal usa placeholder — não trava o runtime, mas quebra ack `delivered`/`read` do WhatsApp. Já em `master-audit/backlog.md#R2-H-05`. |
| RT-H-02 | **High** | `deleteFlow` **não** faz cascade em `flow_run_steps`/`flow_events`/`flow_dead_letter`/`flow_versions` — cria órfãos. Backlog `R2-H-06`. |
| RT-H-03 | **High** | `saveFlowGraph` sem transação — falha parcial pode zerar grafo. Backlog `R2-H-04`. |
| RT-M-04 | Medium | `resolveVars` sem fallback para objetos não-string; helpers duplicados entre executor e Test Drawer. Backlog `R2-M-07`/`R2-H-02`. |
| RT-M-05 | Medium | `/api/public/flow-resume` sem `ORDER BY resume_at` explícito e batch fixo 20 — se acumular > 20 pausados, latência cresce. Backlog `R2-M-08`. |
| RT-M-06 | Medium | Nó `question` envia mas não pausa automaticamente — depende do autor colocar WAIT depois. Backlog `R2-M-10`. |
| RT-M-07 | Medium | `assign_agent` reutiliza `transferNode` e descarta `agent_id`. Backlog `R2-M-09`. |
| RT-L-08 | Low | Reset de `seq` em retomadas — cosmético, não afeta integridade. |
| RT-L-09 | Low | Cycle guard bloqueia loops legítimos (limite fixo). Backlog `R2-H-03`. |

## Evidências

- `flow_events` distinctos em produção: `RuntimeRunCreated`, `RuntimeVersionResolved`, `RuntimeGraphResolved`, `RuntimeEntryNodeResolved`, `NodeStarted`, `NodeFinished`, `FlowPaused`, `FlowResumed`, `FlowCompleted` — **9 tipos**, todos emitidos.
- `flow_runs`: 23 linhas em produção; 34 dead tuples indicam ciclo saudável de vacuum.
- `flow_run_steps`: 75 linhas; `scheduler_heartbeats`: 521.
- Auditoria de paridade completa em `docs/audits/inbox/RUNTIME-PARITY-mission-report.md`.

## Recomendações (backlog)

- **RT-H-01/02/03** → tratar cada um como sub-missão individual **antes ou logo após** o piloto WebMarcas. Cada uma tem escopo <1 dia.
- **RT-M-04..07** → pós-piloto, agrupar em missão "Flow Studio Polish".
- **RT-L-08/09** → baixa prioridade.

**Recomendação Fase 1:** runtime **congelável para o piloto**. Nenhum Critical. Os 3 Highs (RT-H-01/02/03) são conhecidos, isolados e não bloqueiam o piloto WebMarcas com canal real configurado.
