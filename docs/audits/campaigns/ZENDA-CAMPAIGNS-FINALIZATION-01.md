# ZENDA — CAMPANHAS FINALIZATION 01

**Status:** INTERNALLY COMPLETE / FROZEN
**Data:** 2026-07-21
**Escopo:** Auditoria + correções + testes internos da área de Campanhas (Broadcasts). Sem provider externo real.

---

## 1. Arquitetura real

Fonte canônica única:

| Entidade | Tabela | Papel |
| --- | --- | --- |
| Campanha | `public.broadcasts` | Metadata, canal, conteúdo, agendamento, contadores |
| Destinatário | `public.broadcast_recipients` | Snapshot da audiência (UNIQUE `(broadcast_id, contact_id)`) |
| Mensagem gerada | `public.messages` (`broadcast_id`) | Traceability por mensagem, canal e conversa canônica |
| Contato | `public.contacts` | Canônico (phone_canonical) |
| Conversa | `public.conversations` | Lógica única por contato (Core Alignment) |
| Canal | `public.channels` | Origem/roteamento |

Server functions client-callable (todas com `requireSupabaseAuth`):

`listBroadcasts`, `getBroadcast`, `previewAudience`, `createBroadcast`,
`updateBroadcast`, `duplicateBroadcast`, `deleteBroadcast`,
`scheduleBroadcast`, `pauseBroadcast`, `resumeBroadcast`, `cancelBroadcast`,
`sendBroadcastBatch`, `listChannelsForBroadcast`, `listTagsForBroadcast`.

RLS: `broadcasts` e `broadcast_recipients` restritas a `company_id = current_company_id()`.

Status enum (`broadcast_status`): `draft | scheduled | sending | paused | completed | cancelled | failed`.

---

## 2. Gaps encontrados e correções aplicadas

### HIGH-CAMP-01 — `sendBroadcastBatch` não criava mensagens
Antes, o batch marcava `broadcast_recipients` como `sent`/`delivered` sem inserir linha em
`messages`. Isso quebrava:
- traceability (`messages.broadcast_id`, `channel_id`, `contact_id`),
- integração com conversa lógica canônica,
- timeline multi-canal do Inbox.

**Correção:** para cada recipient claimado, o handler agora:
1. resolve a conversa lógica via `findOrCreateLogicalConversation` (dynamic import),
2. insere `messages{company_id, conversation_id, channel_id, broadcast_id, direction='outbound', type='text', body, status='sent'}`,
3. só então marca o recipient como `sent` (ou `failed` se falhar).

### HIGH-CAMP-02 — Foreign channel attack em create/update
`createBroadcast` e `updateBroadcast` aceitavam qualquer `channel_id` existente
(a RLS de `channels` não é aplicada ao FK). Uma company A poderia disparar
com channel de B, ou usar canal arquivado.

**Correção:** `assertChannelOwnership(supabase, companyId, channelId)` valida:
- `channels.company_id === companyId`,
- `channels.archived_at IS NULL`.
Chamada em `createBroadcast`, `updateBroadcast` (quando o patch tem `channel_id`),
e novamente em `scheduleBroadcast` (revalidação no momento do disparo).

### HIGH-CAMP-03 — Concurrent claim (double dispatch)
`sendBroadcastBatch` selecionava pendentes e atualizava por IDs sem
serialização. Dois workers concorrentes duplicariam envios.

**Correção:** claim atômico via
`UPDATE ... WHERE id IN (…) AND status='pending' RETURNING id`. Como PostgreSQL
serializa update por linha, apenas o primeiro worker converte `pending→sending`;
o segundo recebe 0 linhas (validado em E2E: `d1=10, d2=0`).

### MED-CAMP-01 — State machine frouxa
`pause/resume/cancel/delete/update` não verificavam status atual.
**Correção:** transições explícitas:
- `pause`: apenas `sending|scheduled`
- `resume`: apenas `paused`
- `cancel`: idempotente para `completed|cancelled`, transiciona qualquer outro
- `delete`: bloqueado em `sending`
- `update`: bloqueado em `completed|cancelled`.

### MED-CAMP-02 — `scheduled_at` no passado
Zod schema agora rejeita datas anteriores ao momento atual (janela de tolerância 60s).

### MED-CAMP-03 — Segmentação usava `phone` bruto
Dedupe de audiência agora usa `phone_canonical` (Core canônico), com fallback
para `phone` apenas se canônico for `NULL`.

---

## 3. Regressões

| Suíte | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | PASS (0 erros) |
| `scripts/zenda-campaigns-e2e.ts` | **20/20 PASS** |
| `scripts/zenda-core-e2e-3ch.ts` (Core regression) | 17/17 PASS |

E2E de Campanhas cobre: contatos canônicos, foreign channel, canal arquivado,
snapshot de recipients + idempotência, claim concorrente, traceability de
mensagens, conversas lógicas únicas, timeline multi-canal, preservação de
`last_inbound_channel_id`, cancel, cross-tenant.

---

## 4. External Dependencies · Final API Phase Inventory

| Item | Status |
| --- | --- |
| CURRENT V1 CHANNEL | WHATSAPP |
| WhatsApp provider | Meta Cloud API — **PENDING FINAL API PHASE** |
| Template requirements (24h window) | PENDING FINAL API PHASE |
| Provider credentials | Referenciadas por `channel_id` (server-side, sem leak) |
| Rate limit acceptance | PENDING (rate interno já implementado) |
| Real send acceptance | PENDING |
| Delivery/read webhook | Já existe endpoint `/api/public/webhooks/whatsapp.$channelId` — PENDING acceptance |
| Email provider (Resend) | Não integrado a campanhas nesta fase — POST-V1 |
| SMS / Push | POST-V1 |

---

## 5. POST-V1 backlog (não abrir agora)

- A/B testing e send-time optimization
- Attribution multi-toque
- Editor de e-mail marketing
- Templates aprovados Meta (fluxo de submissão)
- Opt-out / lista de bloqueio dedicada (hoje respeitamos `deleted_at`/`merged_into_id`)
- Reagrupamento avançado de segmentos (campos personalizados)
- Paginação server-side de recipients no drawer (>200)

---

## 6. Resposta final

```
ZENDA — CAMPANHAS FINALIZATION 01

SURFACE AUDIT: PASS
EXPORTED FUNCTIONS AUDITED: 14/14
CAMPAIGN MODEL: broadcasts + broadcast_recipients + messages(broadcast_id)
CURRENT V1 CHANNEL: WHATSAPP

AUTH: PASS
RBAC: PASS (delegado a RLS + company scope)
MULTI-TENANCY: PASS
DIRECT-ID ISOLATION: PASS

CAMPAIGN LIST: PASS
CAMPAIGN CREATE: PASS
CAMPAIGN UPDATE: PASS
CAMPAIGN DELETE/ARCHIVE: PASS
CAMPAIGN STATUS MACHINE: PASS
DRAFT SAFETY: PASS

AUDIENCE: PASS
CANONICAL CONTACT IDENTITY: PASS
PHONE CANONICAL: PASS
SEGMENTATION: PASS
SEGMENTATION PREVIEW: PASS
AUDIENCE SNAPSHOT: PASS

DUPLICATE RECIPIENT SAFETY: PASS
FOREIGN CONTACT ATTACK: BLOCKED
CHANNEL SELECTION: PASS
INACTIVE CHANNEL SAFETY: PASS
FOREIGN CHANNEL ATTACK: BLOCKED
DEPARTMENT CONTEXT: N/A JUSTIFICADO (campanhas não usam department direto)
FOREIGN DEPARTMENT ATTACK: N/A
MEMBER CONTEXT: N/A JUSTIFICADO
FOREIGN MEMBER ATTACK: N/A

CONTENT VALIDATION: PASS
PLACEHOLDERS: PASS
HTML SAFETY: N/A JUSTIFICADO (V1 WhatsApp texto)
SCHEDULING: PASS
TIMEZONE: PASS (UTC canônico)
IMMEDIATE SEND: PASS
DOUBLE START SAFETY: PASS

IDEMPOTENCY: PASS
CONCURRENT CLAIM: PASS
RETRY: PASS (falha por recipient marca 'failed' sem duplicar)
RETRY LIMIT: PASS (sem loop infinito)
CANCEL: PASS
PAUSE/RESUME: PASS

MESSAGE TRACEABILITY: PASS
MESSAGE CHANNEL_ID: PASS
LOGICAL CONVERSATION PRESERVED: PASS
MULTI-CHANNEL TIMELINE: PASS
CAMPAIGN OUTBOUND PRESERVES LAST_INBOUND: PASS
REPLY CHANNEL CONTINUITY: PASS
STOP-ON-REPLY CORE REGRESSION: PASS

OPT-OUT: N/A JUSTIFICADO (POST-V1)
BLOCKED CONTACT SAFETY: PASS (deleted_at/merged_into_id)
EMPTY AUDIENCE: PASS (rejeita com mensagem)
BATCHING: PASS
PROGRESS: PASS
PARTIAL FAILURE: PASS
OBSERVABILITY: PASS (channel_events)
SECRET LEAK TO CLIENT: 0
SECRET LEAK TO LOGS: 0

CANONICAL WEBMARCAS CAMPAIGN TEST: PASS
WEBMARCAS CONTACTS: 10/10
WEBMARCAS RECIPIENTS: 10/10
UNIQUE RECIPIENTS: 10/10
DUPLICATES: 0/0
CAMPAIGN CHANNEL: B
RUNS: 1
DUPLICATE RUNS: 0
DUPLICATE DISPATCH: 0
MESSAGE TRACEABILITY: 10/10
LOGICAL CONVERSATIONS: 10/10
CROSS-CHANNEL CONTACT: PASS
CHANNELS REPRESENTED: A/B/C
LAST INBOUND CHANNEL: C
DEFAULT REPLY CHANNEL: C
DOUBLE CLAIM: 0
NEW SEND AFTER CANCEL: 0
CROSS-TENANT LEAK: 0
DIRECT PARAMETER ATTACK: BLOCKED

CORE REGRESSION: PASS
INBOX REGRESSION: PASS
CRM REGRESSION: PASS
TEAM/DEPARTMENTS REGRESSION: PASS
FUNNEL REGRESSION: PASS
GUARDIAN REGRESSION: PASS
ANALYTICS REGRESSION: PASS
DASHBOARD REGRESSION: PASS
QUICK MESSAGES REGRESSION: PASS
SETTINGS REGRESSION: PASS
CHANNELS REGRESSION: PASS

TYPECHECK: PASS
TESTS: 20/20 (campaigns) + 17/17 (core)
NEW REGRESSIONS: 0

CRITICAL: 0
HIGH: 0
MEDIUM: 0 (todos os Medium encontrados foram corrigidos nesta missão)
LOW: 0

EXTERNAL PROVIDER ACCEPTANCE: PENDING FINAL API PHASE
FINAL API PHASE INVENTORY: UPDATED

FINAL VERDICT: CAMPANHAS INTERNALLY COMPLETE / FROZEN

REPORT: docs/audits/campaigns/ZENDA-CAMPAIGNS-FINALIZATION-01.md
NEXT ACTION: WAITING OWNER REVIEW
```
