# Runtime Scheduler — Operação (Runtime-02.3)

Owner: Runtime Engine.
Endpoint: `POST /api/public/flow-resume` (health: `GET`).

## Como funciona

1. `pg_cron` executa o job `flow-scheduler-tick` a cada 60 s.
2. `pg_net.http_post` chama `https://project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app/api/public/flow-resume` com header `apikey: <SUPABASE_PUBLISHABLE_KEY>`.
3. O handler:
   - autentica (apikey do projeto **ou** `x-scheduler-secret === FLOW_SCHEDULER_SECRET`);
   - busca até **50** `flow_runs` em `WAITING_DELAY` / `RETRYING` com `resume_at <= now()` (mais antigo primeiro);
   - chama `executeRun` para cada uma (o executor cuida do lock via `flow_run_acquire_lock`, idempotência e retries);
   - grava um heartbeat em `scheduler_heartbeats` com `processed`, `resumed`, `failed`, `duration_ms`.

## Autenticação

Dois modos suportados, qualquer um serve:

| Header | Valor | Uso |
|---|---|---|
| `apikey` | `SUPABASE_PUBLISHABLE_KEY` | pg_cron (padrão) |
| `x-scheduler-secret` | `FLOW_SCHEDULER_SECRET` | cron externo/staging |

`FLOW_SCHEDULER_SECRET` é gerenciado por Lovable Cloud secrets (48 chars). Rotacionar via `update_secret`.

## Frequência recomendada

`* * * * *` (60 s). A latência máxima de retomada é ~120 s (worst case: run agenda `resume_at = now()+X`, próximo tick ocorre até 60s depois, executor gasta ~1s).

## Timeout / Retry

- Timeout do handler: default do worker (~30s). Batch = 50 runs → fica bem abaixo.
- Retry: se um tick falhar, `pg_cron` chama de novo em 60 s. Runs continuam elegíveis (nada é consumido de forma destrutiva).
- Idempotência: o executor já usa `flow_run_acquire_lock` — dois ticks concorrentes na mesma run não duplicam side-effects.

## Deploy

Nenhum passo manual: a rota é uma TanStack file route publicada automaticamente com o app. `pg_cron` foi registrado via migration + supabase insert (jobid persistente).

## Monitoramento

- **Health probe:** `curl https://<host>/api/public/flow-resume` → 200 com `healthy`, `backlog_due_now`, `last_heartbeat`.
- **Backlog persistente:** `SELECT count(*) FROM flow_runs WHERE state='WAITING_DELAY' AND resume_at < now() - interval '5 minutes'` deve ser 0.
- **Heartbeats:** `SELECT * FROM scheduler_heartbeats ORDER BY created_at DESC LIMIT 10`.
- **Cron history:** `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20` (acessível apenas via psql admin, não pela API).

## Recuperação

Se o Scheduler parar (`healthy: false` ou backlog crescendo):

1. `SELECT jobid, active, schedule FROM cron.job WHERE jobname='flow-scheduler-tick';` — confirmar `active=true`.
2. Se inativo: `SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname='flow-scheduler-tick';`.
3. Se o job foi removido: re-executar o `SELECT cron.schedule(...)` da migration.
4. Trigger manual imediato:
   ```
   curl -X POST https://<host>/api/public/flow-resume \
     -H "apikey: <SUPABASE_PUBLISHABLE_KEY>"
   ```
5. Se runs continuarem presas após o tick manual: inspecionar `flow_events` da run para achar o erro do executor.
