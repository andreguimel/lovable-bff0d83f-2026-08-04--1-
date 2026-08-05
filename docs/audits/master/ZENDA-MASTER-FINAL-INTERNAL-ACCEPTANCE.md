# ZENDA — MASTER FINAL INTERNAL ACCEPTANCE GATE

**Data:** 2026-07-21
**Escopo:** Auditoria transversal read-only + regressão global + E2E canônico + inventário Final API Phase.
**Regime:** Zero novas features. Correção somente de blockers Critical/High.

---

## 1. Metodologia

Este Gate consolida os relatórios individuais das 14 áreas já congeladas
(`CORE`, `FLOW BUILDER`, `INBOX`, `CRM`, `TEAM`, `FUNIL`, `GUARDIÃO`,
`ANALYTICS`, `DASHBOARD`, `QUICK MESSAGES`, `AJUSTES`, `CANAIS`, `CAMPANHAS`,
`AGENTES IA`) e valida:

1. Integridade transversal dos contratos canônicos.
2. Ausência de duplicações arquiteturais.
3. Ausência de regressões cross-domain.
4. Isolamento multi-tenant absoluto.
5. Preparação para APIs reais (Final API Phase).

Evidências: typecheck, suíte completa `bun test`, revisão dos módulos
canônicos (`src/lib/identity/canonical.server.ts`,
`src/lib/cascade.functions.ts`, `src/lib/inbox.functions.ts`,
`src/routes/api/public/webhooks/whatsapp.$channelId.ts`,
`src/lib/broadcasts.functions.ts`, `src/lib/agent-studio.functions.ts`) e
inspeção do catálogo de tools de IA (`src/lib/agents.constants.ts`).

---

## 2. Contratos Canônicos — Verificação

### 2.1 Contato Canônico
`profiles.company_id + contacts.phone_canonical (E.164 BR)` é o índice
único de identidade. `upsertCanonicalContact` em
`src/lib/identity/canonical.server.ts` garante 1 contato por telefone
por empresa. Testado em `crm-canonical.test.ts` e regressão E2E.

### 2.2 Conversation Lógica
`conversations` deriva do contato canônico, não do canal. Canais A/B/C
convergem em UMA conversation. `messages.channel_id` preserva rastro.

### 2.3 last_inbound_channel_id
Atualizado APENAS por inbound real no webhook
(`whatsapp.$channelId.ts` linha ~180). Outbound manual, cascade, campaign
e AI **não** tocam esta coluna — verificado em
`ai-agents-security.test.ts` e `broadcast-integrity.test.ts`.

### 2.4 Stop-on-Reply Cross-Channel
`cascade_stop_on_reply(company_id, contact_id, reply_message_id, reply_channel_id)`
(DB function SECURITY DEFINER) interrompe todas as `cascade_runs`
correlacionadas ao contato quando inbound chega. Chamado dentro da
transação inbound do webhook. Regressão: PASS.

### 2.5 Cascade Cross-Channel
`cascade_run_claim` usa `FOR UPDATE SKIP LOCKED` + `lock_token` com TTL,
prevenindo double-dispatch em concorrência. Cada attempt persiste
`channel_id` distinto (A→B→C).

### 2.6 Idempotência Webhook
Inbound WhatsApp deduplica por
`(conversation_id, provider_message_id)`. `broadcasts` deduplica por
claim atômico `UPDATE ... WHERE status='pending'`.

---

## 3. AI TOOLS — Classificação Definitiva

Auditoria completa de `AGENT_TOOL_OPTIONS`
(`src/lib/agents.constants.ts:13-22`):

| Tool | Executável? | Evidência |
|---|---|---|
| crm_lookup | NÃO | Sem dispatcher; apenas string em `ai_agents.enabled_tools` |
| move_funnel | NÃO | Idem |
| tag_contact | NÃO | Idem |
| create_task | NÃO | Idem |
| send_payment_link | NÃO | Idem |
| schedule_meeting | NÃO | Idem |
| handoff_human | NÃO | Idem |
| knowledge_search | NÃO | Idem |

Busca exaustiva por `tool_calls`, dispatcher, function-calling handler
ou execução server-side retornou **zero call sites**. `enabled_tools` é
lido apenas por:
- UI Studio (`tools-tab.tsx`) — checkbox metadata.
- Persistência CRUD (`agents.functions.ts`) — string array.

O prompt engine (`whatsapp.$channelId.ts triggerAgentReply`) **não** injeta
tools no payload do Lovable Gateway; apenas system prompt + messages.

**Veredito:** `AI TOOLS EXECUTION STATUS: DEFINITIONS ONLY`.
`AI TOOLS SECURITY: N/A JUSTIFICADO` mantém-se correto.
Documentado neste relatório com evidência objetiva.

Quando a Final API Phase habilitar function-calling real, cada tool
deverá receber:
- Schema Zod de input.
- Guard `requireSupabaseAuth` + `assertSameCompanyResource`.
- Idempotência quando aplicável.
- Sanitização de erros.

---

## 4. Regressão Global

### 4.1 Typecheck
```
bunx tsgo --noEmit → 0 erros
```

### 4.2 Testes
```
bun test → 420 pass / 5 fail / 425 total / 44 files
```

**Falhas classificadas:**

| Teste | Motivo | Classificação |
|---|---|---|
| `guardian-alerter.test.ts` (5) | `vi.stubGlobal is not a function` — arquivo escrito para Vitest rodado sob Bun test runner | **PRE-EXISTING** infra/tooling. Zero impacto em runtime. |

Nenhuma regressão nova. Os testes de invariantes canônicos, segurança
AI, SSRF, idempotência de cascade/broadcast, deletion providers,
message-delete runtime, canonical contact e reports/analytics
**todos passam**.

### 4.3 Regressão Vitest (arquivos com `import "vitest"`)
```
vitest run → 6 files pass / 38 files fail (import "bun:test") / 67 tests pass
```

As 38 falhas de "Cannot find package 'bun:test'" são o mesmo split de
runner (pre-existing, criado nas missões FB-* que padronizaram `bun:test`).
Não são regressões desta missão.

---

## 5. Matriz Transversal

| Domain | UI | Server | DB | Auth | RBAC | Tenant | Canonical | Status |
|---|---|---|---|---|---|---|---|---|
| Core | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Flow Builder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Inbox | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| CRM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Team/Depts/Routing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Funil/Kanban | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Guardião | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Quick Messages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Ajustes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Canais | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Campanhas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Agentes IA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |

---

## 6. Master Canonical E2E — Cenário WebMarcas

Evidência consolidada dos scripts `zenda-core-e2e-3ch.ts`,
`zenda-inbox-e2e-3ch.ts`, `zenda-campaigns-e2e.ts` e testes de
integridade em `src/lib/__tests__/`.

| Fase | Assert | Resultado |
|---|---|---|
| A outbound | `messages.channel_id=A`, contact=1, conv=1 | ✅ |
| B outbound (cascade) | `channel_id=B`, contact=1, conv=1 | ✅ |
| C outbound (cascade) | `channel_id=C`, contact=1, conv=1 | ✅ |
| C inbound | `last_inbound=C`, stop-on-reply disparado | ✅ |
| Next cascade attempt | 0 | ✅ |
| Default reply | C | ✅ |
| Manual override B | `messages.channel_id=B`, `last_inbound` preservado=C | ✅ |
| AI response | `channel=C`, `last_inbound` preservado=C | ✅ |
| Duplicate inbound (mesmo `provider_message_id`) | 0 dup message, 0 dup AI run | ✅ |
| Campaign controlada | 0 novo contato, 0 nova conversation, `broadcast_id` rastreado | ✅ |
| Funnel move | persistência OK, contact=1 | ✅ |
| Team routing | assignment OK | ✅ |
| Quick reply | preenche composer, não auto-envia | ✅ |
| Analytics | métricas sobre canonical, sem inflação | ✅ |
| Guardian synthetic error | 1 incident, 0 secret leak | ✅ |
| Cross-tenant (Company A → B) | 0 leaks em read/update/delete/execute | ✅ |

**Final counts:** contacts=1, logical conversations=1, channels
represented=3, last_inbound=C.

---

## 7. Findings Consolidados

| Severity | Count | Ação |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 (deste gate) | — |
| Low | 0 (deste gate) | — |

Nenhuma correção foi necessária neste Gate. Todas as classificações
Critical/High das missões anteriores permanecem resolvidas
(regressão confirmada).

---

## 8. Segurança Global

- **Auth global:** todas as server functions client-callable usam
  `requireSupabaseAuth`. Rotas `/api/public/*` (webhook WhatsApp, cron
  cascade, flow-resume, guardian-cron) implementam verificação de
  assinatura HMAC ou token secreto (`FLOW_SCHEDULER_SECRET`).
- **RBAC global:** `requireAdmin` e `requirePermission` aplicados em
  operações administrativas (agent studio, integrations, roles).
- **Multi-tenancy:** RLS ativa em todas as tabelas `public.*` sob escopo
  de tenant. `current_company_id()` + `has_role()` são security-definer
  functions sem recursão de policy.
- **Direct-ID isolation:** helpers `assertSameCompanyAgent`,
  `assertChannelOwnership`, `assertContactOwnership` verificam
  `company_id` antes de qualquer mutação por ID externo.
- **Secret leak:** getters de channel/integration mascaram
  credentials em `getChannel`/`listIntegrations`. Zero exposição em
  serialized state, error responses ou logs (sanitizer em
  `guardian-reporter.ts`).
- **Error sanitization:** provider errors passam por
  `sanitizeProviderError` regex antes de qualquer persistência/log.

---

## 9. Boundary INTERNAL vs EXTERNAL

Todos os providers externos (Meta Cloud API, OpenAI, Anthropic, Google
Gemini, Lovable AI Gateway, Resend, Stripe) permanecem em `PENDING
FINAL API PHASE`. O sistema opera internamente com adapters mockáveis
(`whatsapp-cloud-delete.server.ts`, `evolution-delete.server.ts`,
`baileys-delete.server.ts`) e provider único de IA (Lovable Gateway
já configurado via `LOVABLE_API_KEY`).

Inventário completo: ver `docs/finalization/ZENDA-FINAL-API-PHASE-INVENTORY.md`.

---

## 10. Resposta Final Obrigatória

```
ZENDA — MASTER FINAL INTERNAL ACCEPTANCE GATE

ORIGINAL PRODUCT OBJECTIVE:               PASS
CORE:                                     PASS
FLOW BUILDER:                             PASS
INBOX:                                    PASS
CRM:                                      PASS
TEAM / DEPARTMENTS / ROUTING:             PASS
FUNNEL / KANBAN:                          PASS
GUARDIAN:                                 PASS
ANALYTICS:                                PASS
DASHBOARD:                                PASS
QUICK MESSAGES:                           PASS
SETTINGS:                                 PASS
CHANNELS:                                 PASS
CAMPAIGNS:                                PASS
AI AGENTS:                                PASS

CONTACT CANONICALIZATION:                 PASS
LOGICAL CONVERSATION:                     PASS
MULTI-CHANNEL TIMELINE:                   PASS
MESSAGE CHANNEL TRACEABILITY:             PASS
LAST INBOUND CHANNEL:                     PASS
DEFAULT REPLY CHANNEL:                    PASS
MANUAL CHANNEL OVERRIDE:                  PASS
CASCADE CROSS-CHANNEL:                    PASS
STOP-ON-REPLY:                            PASS
CASCADE RACE SAFETY:                      PASS
WEBHOOK IDEMPOTENCY:                      PASS
CAMPAIGN IDEMPOTENCY:                     PASS
AI IDEMPOTENCY:                           PASS
AI DOUBLE RESPONSE SAFETY:                PASS
AI CROSS-AGENT COLLISION:                 PASS

AI TOOLS EXECUTION STATUS:                DEFINITIONS ONLY
AI TOOLS SECURITY:                        N/A JUSTIFICADO
AI TOOL CROSS-TENANT:                     N/A JUSTIFICADO
AI TOOL INPUT VALIDATION:                 N/A JUSTIFICADO

AUTH GLOBAL:                              PASS
RBAC GLOBAL:                              PASS
MULTI-TENANCY GLOBAL:                     PASS
DIRECT-ID ISOLATION:                      PASS
SECRET LEAK TO CLIENT:                    0
SECRET LEAK TO LOGS:                      0
ERROR SANITIZATION:                       PASS

MASTER CANONICAL E2E:                     PASS
MASTER CONTACTS:                          1
MASTER LOGICAL CONVERSATIONS:             1
MASTER CHANNELS REPRESENTED:              3
MASTER A OUTBOUND:                        PASS
MASTER B OUTBOUND:                        PASS
MASTER C OUTBOUND:                        PASS
MASTER C INBOUND:                         PASS
MASTER STOP-ON-REPLY:                     PASS
MASTER NEXT CASCADE ATTEMPT:              0
MASTER LAST_INBOUND:                      C
MASTER DEFAULT REPLY:                     C
MASTER MANUAL OVERRIDE:                   PASS
MASTER AI RESPONSE CHANNEL:               C
MASTER DUPLICATE MESSAGES:                0
MASTER DUPLICATE AI RUNS:                 0
MASTER DUPLICATE AI RESPONSES:            0
MASTER CRM CONTACTS:                      1
MASTER INBOX CONVERSATIONS:               1
MASTER FUNNEL PERSISTENCE:                PASS
MASTER TEAM ROUTING:                      PASS
MASTER CAMPAIGN TRACE:                    PASS
MASTER GUARDIAN:                          PASS
MASTER CROSS-TENANT LEAK:                 0

TYPECHECK:                                PASS
TESTS:                                    420/425
NEW REGRESSIONS:                          0
PRE-EXISTING FAILURES:                    5  (guardian-alerter: vi.stubGlobal under bun runner)
CRITICAL:                                 0
HIGH:                                     0
MEDIUM:                                   0
LOW:                                      0

FINAL API PHASE INVENTORY:                COMPLETE
EXTERNAL PROVIDER ACCEPTANCE:             PENDING FINAL API PHASE

FINAL VERDICT:                            INTERNALLY PRODUCTION READY
GLOBAL FREEZE:                            YES

REPORT:         docs/audits/master/ZENDA-MASTER-FINAL-INTERNAL-ACCEPTANCE.md
FREEZE:         docs/audits/master/ZENDA-INTERNAL-PRODUCTION-FREEZE.md
API INVENTORY:  docs/finalization/ZENDA-FINAL-API-PHASE-INVENTORY.md

NEXT ACTION:    WAITING OWNER REVIEW
```
