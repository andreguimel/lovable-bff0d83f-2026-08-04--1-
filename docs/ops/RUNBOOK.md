# RUNBOOK — Zenda (Piloto WebMarcas)

Guia operacional canônico. Sempre começar por aqui em qualquer incidente.
Ordem obrigatória: **Identificar → Diagnosticar → Recuperar → Validar → Registrar**.

## URLs de referência

- **Produção:** https://talkebase.lovable.app
- **Preview:** https://id-preview--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app
- **URL estável prod:** `project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app`
- **URL estável preview:** `project--ef9df983-c11b-4be3-afb7-c9014c9322dd-dev.lovable.app`
- **Healthchecks:** `/api/public/health`, `/api/public/live`, `/api/public/ready`, `/api/public/metrics`

## Cenários

### 1. Webhook da Meta / WhatsApp Cloud parou de entregar

**Identificar:**
- Nenhuma conversa nova no Inbox há > 15 min.
- `SELECT max(created_at) FROM public.channel_events WHERE type LIKE 'whatsapp%';` distante.
- Verificar `/api/public/health` retorna 200.

**Diagnosticar:**
1. Testar a URL do webhook: `curl -X GET "https://project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app/api/public/webhooks/whatsapp/<channelId>?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ping"` → esperar `ping`.
2. Conferir Meta App Dashboard → Webhooks → status de callback.
3. Ver logs recentes com `stack_modern--server-function-logs` filtrando por `whatsapp-webhook`.

**Recuperar:**
- Reassinar o webhook na Meta.
- Se a URL mudou (nunca deve — usar URL estável), reconfigurar.
- Se assinatura HMAC falha, checar `WHATSAPP_APP_SECRET` no canal.

**Validar:**
- Enviar mensagem de teste; conferir chegada em `messages` (direction=inbound).

**Registrar:**
- Abrir card no `docs/ops/INCIDENT_RESPONSE.md` com timestamp e causa.

---

### 2. Cron parou (flow-scheduler / cascade-tick / guardian-cron)

**Identificar:**
- `SELECT max(observed_at) FROM public.scheduler_heartbeats;` sem novos batimentos há > 5 min.
- Retomadas de flow paradas: `SELECT count(*) FROM public.flow_runs WHERE state='WAITING' AND resume_at < now() - interval '2 minutes';`

**Diagnosticar:**
1. `SELECT jobid, jobname, active FROM cron.job;` — jobs ativos?
2. `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;` — falhas recentes?
3. Chamada manual: `curl -H "apikey: <SUPABASE_PUBLISHABLE_KEY>" https://project--…lovable.app/api/public/flow-resume`

**Recuperar:**
- Se cron desativado: `SELECT cron.alter_job(jobid, active := true);`.
- Se rota 500: ver `stack_modern--server-function-logs` filtrando por `flow-resume`.
- Se `FLOW_SCHEDULER_SECRET` inválido: revalidar com o operador (não trocar sem coordenação).

**Validar:**
- Novo heartbeat em `scheduler_heartbeats` no minuto seguinte.
- Fila de retomadas volta a diminuir.

---

### 3. Banco lento

**Identificar:**
- p95 acima do baseline em `docs/audits/phase1-perf-baseline.md`.
- Timeouts em server functions (500).

**Diagnosticar:**
- Ferramenta `supabase--slow_queries`.
- `supabase--db_health` para conexões / cache hit ratio.

**Recuperar:**
- Rejeitar temporariamente carga externa (Meta rate-limit natural absorve).
- Escalar upstream se necessário (via Lovable Cloud → Advanced).

**Validar:**
- `db_health` normalizado; p95 abaixo do baseline.

---

### 4. Guardian abriu incident High/Critical

**Identificar:**
- Alerta chegou no webhook externo (OBS-H-01) OU toast no painel.
- `SELECT * FROM public.guardian_incidents WHERE status='open' ORDER BY created_at DESC;`

**Diagnosticar:**
- Abrir `/settings/audit` → clicar em "Analisar" no incidente.
- Ler `context.probableCause` e `context.recommendedAction`.

**Recuperar:**
- Se autoreparável: acionar `repairAction` no painel.
- Se requer intervenção: seguir `INCIDENT_RESPONSE.md`.

**Validar:**
- Incidente muda para `resolved` em `guardian_incidents`.

---

### 5. Storage cheio / upload falhando

**Identificar:**
- Uploads no Inbox retornam erro; `contact-files` / `message-media` recusa.

**Diagnosticar:**
- `supabase--read_query`: `SELECT bucket_id, count(*), sum(metadata->>'size')::bigint FROM storage.objects GROUP BY 1;`
- Confirmar limite de plano em `plan_limits`.

**Recuperar:**
- Purgar mídia > 30 dias manualmente (não há lifecycle automático — ver backlog ST-M-01).
- Aumentar plano se aplicável.

---

### 6. LOVABLE_API_KEY revogada

**Identificar:**
- Agentes IA falham com 401/403; logs mostram "invalid api key".

**Recuperar:**
- Rotacionar via `ai_gateway--rotate_lovable_api_key` (ferramenta oficial).
- **Nunca** usar `update_secret` para essa chave — é gerenciada.

**Validar:**
- Playground do agente responde.

---

### 7. Deploy quebrou (publish falha ou preview branco)

**Identificar:**
- Página branca em produção OU erro de build no publish.

**Recuperar:**
- Publish anterior permanece ativo até o novo ser confirmado. Sem rollback manual necessário.
- Corrigir o erro no preview; republicar.

**Validar:**
- `/api/public/health` 200; navegação canônica funciona.

---

### 8. Restore após incidente crítico

Ver `DISASTER_RECOVERY.md`.

---

## Ferramentas úteis (referência rápida)

| Necessidade | Ferramenta |
|---|---|
| Ver logs runtime | `stack_modern--server-function-logs` |
| Ver logs de edge functions | `supabase--edge_function_logs` |
| Executar SELECT ad-hoc | `supabase--read_query` |
| Queries lentas | `supabase--slow_queries` |
| Saúde do banco | `supabase--db_health` |
| Linter segurança | `supabase--linter` |
| Rotacionar chave IA | `ai_gateway--rotate_lovable_api_key` |
