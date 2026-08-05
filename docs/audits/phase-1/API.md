# API.md

## Estado atual

Duas superfícies de API:

### 1) Server Functions (RPC tipado)

- **263 chamadas** `createServerFn` em **31 arquivos**.
- Todas seguem o padrão canônico: `.inputValidator(Zod).handler(async ({ data, context }) => ...)`.
- Chamadas autenticadas usam `.middleware([requireSupabaseAuth])` → `context.supabase` respeita RLS do usuário.
- Chamadas privilegiadas importam `supabaseAdmin` **dentro do handler** (não no topo do módulo).

Distribuição por módulo (top 10):

| Módulo | Aproximado |
|---|---|
| `flow-executor.functions.ts` | motor + ações administrativas |
| `flow-studio.functions.ts` | editor de fluxos |
| `inbox.functions.ts` | inbox operacional |
| `crm.functions.ts` / `crm-hub.functions.ts` | CRM |
| `agents.functions.ts` / `agent-studio.functions.ts` | agentes IA |
| `channels.functions.ts` | canais WhatsApp |
| `broadcasts.functions.ts` | disparos |
| `cascade.functions.ts` | escalonamento |
| `team.functions.ts` / `team-studio.functions.ts` | time |
| `reports.functions.ts` / `analytics.functions.ts` | relatórios |

### 2) Rotas HTTP públicas (`/api/public/*`)

9 endpoints em `src/routes/api/public/`:

| Endpoint | Propósito | Auth |
|---|---|---|
| `cron/cascade-tick.ts` | Tick de cascatas via `pg_cron` | `apikey` header |
| `flow-resume.ts` | Retomada de flows pausados (WAIT) | `apikey` + `FLOW_SCHEDULER_SECRET` |
| `guardian-cron.ts` | Coleta de snapshots do Guardian | `apikey` |
| `health.ts` / `live.ts` / `ready.ts` | Healthchecks (load balancer) | Público |
| `metrics.ts` | Métricas Prometheus-like | Público / restrito |
| `hooks/whatsapp-webhook.ts` | Webhook oficial Meta | Assinatura HMAC |
| `webhooks/whatsapp.$channelId.ts` | Webhook por canal (multi-tenant) | Assinatura HMAC |

## Pontos fortes

- **`.inputValidator` universal** com Zod — nenhum handler aceita `unknown` sem validar.
- **`requireSupabaseAuth`** centraliza claims + supabase-com-RLS em todas as functions autenticadas.
- **`supabaseAdmin` sempre lazy-loaded** dentro do handler — evita vazamento para bundle client.
- **`start.ts`** registra `attachSupabaseAuth` como `functionMiddleware` → bearer token propagado consistentemente.
- **`/api/public/*`** isolado por convenção do resto das rotas.
- **Webhooks WhatsApp** com assinatura HMAC + `timingSafeEqual`.
- **Cron** com secret adicional (`FLOW_SCHEDULER_SECRET`) além do `apikey` — defesa em profundidade.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| API-M-01 | Medium | Contratos Zod duplicados entre `.functions.ts` (input) e `.server.ts` (persistência) — divergência silenciosa possível. |
| API-M-02 | Medium | `AppError` (ADR-005) não adotado em 25 `.functions.ts` — respostas de erro heterogêneas. Backlog `F-0002`. |
| API-M-03 | Medium | Faltam testes de contrato ponta-a-ponta em `/api/public/*` (webhooks + cron). Existem testes de unidade em `wa-providers/__tests__`. |
| API-L-04 | Low | Não há versionamento explícito de payloads (v1/v2). Aceitável para monolito, ficar de olho quando abrir para integrações externas. |

## Evidências

- `grep -c "createServerFn" src/lib/*.functions.ts` → 263 ocorrências.
- `find src/routes/api -type f` → 9 arquivos.
- `src/start.ts` registra `attachSupabaseAuth`.

## Recomendações (backlog)

- **API-M-01** → mover Zod para `src/lib/contracts/` (existe mas subutilizado). **Pós-piloto**.
- **API-M-02** → migrar erros para `AppError` incrementalmente. **Pós-piloto**.
- **API-M-03** → adicionar testes Playwright de webhook. **Pós-piloto**.

**Recomendação Fase 1:** superfície de API **congelável**. Nenhum Critical/High. Toda a dívida é de organização e cobertura de teste — legítima, mas pós-piloto.
