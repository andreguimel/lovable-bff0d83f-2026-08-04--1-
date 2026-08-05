# OPERATIONS.md

## Estado atual

### Deploy

- **Preview**: `https://id-preview--<sandbox>.lovable.app` (a cada save).
- **Produção**: `https://talkebase.lovable.app` (publicado manualmente via Lovable).
- **URLs estáveis**:
  - `project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app` (produção)
  - `project--ef9df983-c11b-4be3-afb7-c9014c9322dd-dev.lovable.app` (preview)

### Cron / Scheduler

- **`pg_cron`** ativo (extensão instalada).
- **`pg_net`** ativo para chamadas HTTP a partir do banco.
- Jobs esperados: `flow-resume`, `cascade-tick`, `guardian-cron`.
- Auth: `apikey` header (anon key) + `FLOW_SCHEDULER_SECRET` para flow-resume.

### Secrets ativos (6)

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` — gerenciados pelo Lovable Cloud.
- `LOVABLE_API_KEY` — Lovable AI Gateway (agentes IA).
- `FLOW_SCHEDULER_SECRET` — retomada de flows via cron.

### Backups

- Managed pelo Lovable Cloud / Supabase (retenção padrão Supabase).
- Exportação manual: Cloud → Advanced settings → Export data.

### Providers externos

- **WhatsApp Cloud API (Meta)** — provider principal. Webhook: `/api/public/hooks/whatsapp-webhook` e `/api/public/webhooks/whatsapp/:channelId`.
- **Lovable AI Gateway** — para agentes IA (chat, embeddings).
- Não há Stripe/Paddle ativo no piloto.

## Pontos fortes

- **URLs estáveis** para configuração externa (Meta webhook não quebra se projeto for renomeado).
- **Secrets gerenciados** — nada em `.env` versionado além de config pública.
- **Migrations versionadas** (54 arquivos com timestamp determinístico).
- **Deploy 1-click** via Lovable.
- **Rollback** automático via preview vs published (permanece na versão anterior até publicar de novo).

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| OPS-H-01 | **High** | Nenhum runbook de incidente documentado (o que fazer se: Guardian abrir incident? WhatsApp webhook parar? cron falhar? banco lento?). |
| OPS-H-02 | **High** | Sem processo formal de **rotação de secrets** — `LOVABLE_API_KEY` e `FLOW_SCHEDULER_SECRET` nunca rotacionados. |
| OPS-M-03 | Medium | Sem checklist pré-publicação (typecheck, lint, smoke test) automatizado no fluxo de deploy. |
| OPS-M-04 | Medium | Sem staging separado — preview substitui, mas com mesmos secrets. |
| OPS-M-05 | Medium | Sem plano de disaster recovery documentado (RPO/RTO explícitos). |
| OPS-L-06 | Low | Sem onboarding doc para novos operadores. |

## Evidências

- Publish URL confirmado: `https://talkebase.lovable.app`.
- 6 secrets listados no context.
- Rotas `/api/public/*` — 9 endpoints funcionais.
- `scheduler_heartbeats` — 521 registros/24h confirmam cron ativo.

## Recomendações (backlog)

- **OPS-H-01** → criar `docs/ops/runbook.md` com 6-8 cenários: webhook down, cron parou, banco lento, incident High, storage cheio, chave OpenAI/Lovable revogada, deploy quebrou, restore. **Antes do piloto público**.
- **OPS-H-02** → definir cadência semestral de rotação + procedimento. **Antes do piloto público**.
- **OPS-M-03/04/05** → pós-piloto.
- **OPS-L-06** → pós-piloto.

**Recomendação Fase 1:** operações **congelável para piloto controlado**. Antes de expandir, tratar **OPS-H-01** e **OPS-H-02** como sub-missões (só documentação, sem código).
