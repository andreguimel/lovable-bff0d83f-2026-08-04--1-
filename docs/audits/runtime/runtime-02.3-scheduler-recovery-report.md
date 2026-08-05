# Runtime-02.3 — Scheduler Recovery (P0)

**Status:** ✅ **CONCLUÍDA**.
**Escopo:** Scheduler / endpoint `/api/public/flow-resume` / configuração operacional.
**Não tocado:** Runtime Engine, Executor, Canvas, Providers, IA, Inbox, RBAC, RLS, Design System, Mobile.

---

## Fase 1 — Diagnóstico

| Item | Estado antes | Causa raiz |
|---|---|---|
| `FLOW_SCHEDULER_SECRET` | ausente | nunca gerado |
| `/api/public/flow-resume` | 401 para toda chamada | exigia secret que não existia |
| pg_cron / pg_net | extensões habilitadas | nenhum job registrado |
| Backlog em produção | **3 runs presas** em `WAITING_DELAY` (~20h) | falta de gatilho |

**Categoria da falha:** configuração/operação (não é bug de código do executor).

## Fase 2 — Correção

- `FLOW_SCHEDULER_SECRET` gerado via `generate_secret` (48 chars) — armazenado em Lovable Cloud secrets.
- Endpoint reescrito em `src/routes/api/public/flow-resume.ts`:
  - autentica por `apikey === SUPABASE_PUBLISHABLE_KEY` **ou** `x-scheduler-secret === FLOW_SCHEDULER_SECRET`;
  - batch aumentado para 50 e ordenado por `resume_at ASC`;
  - GET público (sem auth) retornando `healthy`, `backlog_due_now`, `last_heartbeat`.
- pg_cron `flow-scheduler-tick` registrado: chama o endpoint a cada 60s com `apikey`.

Fluxo garantido: `WAIT → resume_at → pg_cron (60s) → /api/public/flow-resume → executeRun → continuação automática`.

## Fase 3 — Observabilidade

- Nova tabela `public.scheduler_heartbeats` (service_role only, RLS on).
- Cada tick grava: `processed`, `resumed`, `failed`, `duration_ms`, `next_expected_at`.
- Health probe (`GET /api/public/flow-resume`) marca `healthy=false` quando `age(last_heartbeat) > 5min`.

## Fase 4 — Testes

- `bunx vitest run src/lib/__tests__/flow-resume-inbound.test.ts` → **6/6 pass** (executor + hand-off atômico).
- Tick manual contra dev server: `processed: 3, resumed: 3, failed: 0, duration_ms: 17364`.
- Health após tick: `healthy: true, backlog_due_now: 0, seconds_since_last_tick: 0`.
- Idempotência: executor mantém `flow_run_acquire_lock` (nenhuma alteração), duplicidade impossível por design.

## Fase 5 — Validação das 3 runs presas

| Run | Antes | Depois | Classificação |
|---|---|---|---|
| `6a6ccd03…` | `WAITING_DELAY` desde 2026-07-15 21:25 | `COMPLETED` 2026-07-16 18:06:27 | **Retomada e finalizada** (4 steps, 5 messages) |
| `5abb9665…` | `WAITING_DELAY` desde 2026-07-15 21:41 | `COMPLETED` 2026-07-16 18:06:33 | **Retomada e finalizada** (4 steps, 5 messages) |
| `75ad31d9…` | `WAITING_DELAY` desde 2026-07-15 21:51 | `COMPLETED` 2026-07-16 18:06:38 | **Retomada e finalizada** (4 steps, 5 messages) |

Backlog atual (`state IN (WAITING_DELAY,RETRYING) AND resume_at < now()`) = **0**.

## Fase 6 — Documentação operacional

`docs/runtime/scheduler-operations.md` cobre: configuração, secret, cron recomendado (`* * * * *`), timeout, retry, deploy, monitoramento (health + heartbeats + `cron.job_run_details`), procedimento de recuperação.

## Critério de aceite

| Item | Status |
|---|---|
| Todos os testes de `WAIT_DELAY` passaram | ✅ |
| Nenhuma run permanece presa após `resume_at` | ✅ (backlog = 0) |
| As 3 runs identificadas foram tratadas | ✅ (retomadas → COMPLETED) |
| Scheduler operacional | ✅ (pg_cron ativo, tick manual comprovado) |
| Health Check saudável | ✅ (`healthy: true`) |
| Build / Typecheck | ✅ (verificação automática do harness) |
| Novos Critical/High | ❌ nenhum |

## Findings

- **F-VAL-01** → RESOLVIDO.
- **F-VAL-02** (2 runs zumbis em `CREATED`) permanece em backlog — fora do escopo desta missão.

## Encerramento

Missão encerrada. Aguardando autorização explícita antes de qualquer nova sub-missão.

---

## Addendum Runtime-02.3.1 (2026-07-16 18:26 UTC) — Fechamento definitivo do loop em produção

**Sintoma pós-missão:** revalidação mostrou o cron a bater no endpoint com `apikey` mas recebendo **401 em cadeia** (`net._http_response` id 494→502, 9 de 10 últimas requisições em 401). Só existia o heartbeat de `18:06:38` (disparo manual da missão).

**Causa raiz:** o worker publicado ainda serve a versão **anterior** do endpoint — o build novo (auth por `apikey` + heartbeats + GET health) só entra em produção após um `Publish` que não foi executado. O binário em produção só aceita `x-scheduler-secret`, e o cron enviava apenas `apikey`.

**Correção aplicada (operacional, sem código):**

- Reagendado `cron.job.flow-scheduler-tick` (jobid 3 → 4) para enviar `x-scheduler-secret: <FLOW_SCHEDULER_SECRET>` em vez de `apikey`.
- Nenhum arquivo do repositório alterado. Nenhuma migration. Nenhum deploy.

**Evidência pós-correção:**

```
status_code |            created
------------+-------------------------------
200         | 2026-07-16 18:26:00.05605+00
200         | 2026-07-16 18:25:00.110898+00
401         | 2026-07-16 18:24:00.037423+00   ← última bateria antiga
```

- `curl -X POST -H "x-scheduler-secret: …" …/api/public/flow-resume` → `200 {"ok":true,"processed":0,…}` (confirmado em produção).
- `flow_runs` presos em `WAITING_DELAY` com `resume_at` no passado = **0**.
- `WAITING_REPLY` pendente = 0.
- 11 runs `CREATED` sem passos (F-VAL-02) permanecem — bug pré-existente, Médio, fora deste escopo.

**Estado final do loop:**
`WAIT → resume_at → pg_cron (60s) → POST /api/public/flow-resume [x-scheduler-secret] → executeRun → continuação automática` — **operacional em produção agora**.

**Nova nota de deploy:** ao publicar o app com a versão nova do endpoint, o path `apikey` também passa a valer. O cron pode continuar em `x-scheduler-secret` (recomendado) — não precisa ser reajustado. `scheduler_heartbeats` só passa a receber inserts a partir da próxima publicação; o probe `GET /api/public/flow-resume` também. É limitação de observabilidade, não do loop de execução.

**F-VAL-01:** ✅ **RESOLVIDO em produção** (não apenas em preview).


