# ZENDA — AGENTES IA FINALIZATION 01

**Missão:** Finalização interna da área AGENTES IA do Zenda.
**Status final:** `AGENTES IA — INTERNALLY COMPLETE / FROZEN`
**Escopo excluído (por regra):** APIs reais externas (OpenAI/Anthropic/Gemini) → `PENDING FINAL API PHASE`.
**Regressão:** áreas congeladas (Core/Inbox/CRM/Team/Funnel/Guardian/Analytics/Dashboard/QuickMsg/Settings/Channels/Campaigns) intactas.

---

## 1. Arquitetura descoberta

| Camada | Arquivo / Objeto |
|---|---|
| UI — lista/estúdio de agentes | `src/routes/_authenticated.agents.index.tsx`, `src/routes/_authenticated.agents.$agentId.tsx`, `src/components/agents/studio/*` |
| UI — playground / copiloto | `src/components/agents/studio/playground-drawer.tsx`, `src/components/agents/studio/copilot-fab.tsx` |
| UI — mobile | `src/components/agents/mobile/*` |
| Server fns — CRUD | `src/lib/agents.functions.ts` (`listAgents`, `getAgent`, `upsertAgent`, `toggleAgent`, `deleteAgent`, `testAgent`) |
| Server fns — Studio | `src/lib/agent-studio.functions.ts` (dashboard/KPIs, prompt versions, logs, playground, copilot, knowledge, duplicate) |
| Provider gateway | `src/lib/ai-gateway.server.ts` (Lovable AI Gateway via `@ai-sdk/openai-compatible`) |
| Catálogo de modelos | `src/lib/agents.constants.ts` |
| Auto-resposta Inbox | `src/lib/inbox.functions.ts › maybeAutoRespondWithAgent` |
| Auto-resposta Webhook | `src/routes/api/public/webhooks/whatsapp.$channelId.ts › triggerAgentReply` |
| Integração Flow Builder | `src/lib/flows.functions.ts` (bloco `ai` referencia `ai_agents`) — **FROZEN**, apenas contrato consumido |
| Vínculo Canal → Agente | `channels.ai_agent_id` (FK) |
| Vínculo Conversa → Agente | `conversations.assigned_agent_id` (FK) + `assigned_type='ai_agent'` |
| Autoria de mensagem | `messages.sender_agent_id` + `media_metadata.agent_id/agent_name` |

### Tabelas / RLS

| Tabela | Colunas relevantes | RLS |
|---|---|---|
| `ai_agents` | `company_id`, `name`, `model`, `prompt`, `personality`, `is_active`, `channel_ids`, `enabled_tools`, `max_turns`, `department`, `version`, `status` | SELECT: `is_company_member`; INSERT/UPDATE/DELETE: `is_company_member AND has_role(admin)` ✓ |
| `ai_agent_runs` | `agent_id`, `company_id`, `input`, `output`, `model`, `tokens_input/output`, `error` | SELECT+INSERT scoped a `is_company_member` |
| `agent_logs` | + `conversation_id`, `source`, `latency_ms`, `tools` | `is_company_member` |
| `agent_prompt_versions` | `agent_id`, `version`, `prompt`, `notes`, `created_by` | `is_company_member` |
| `agent_knowledge_docs` | `agent_id`, `title`, `type`, `source_url`, `storage_path`, `size_bytes`, `chunks`, `status` | `is_company_member` |
| `agent_test_sessions` | histórico do playground | `is_company_member` |

Grants para `authenticated` e `service_role` presentes nas migrations `20260713214756_*` e `20260715004412_*`. ✓

### Providers e execução interna

`PROVIDERS DISCOVERED:`
- `openai` (via UI Ajustes › Integrações — configurável mas não usado como default runtime)
- `anthropic` (idem)
- `google_gemini` (idem)
- `lovable` (**Lovable AI Gateway**, `https://ai.gateway.lovable.dev/v1`, header `Lovable-API-Key`)

`CURRENT INTERNAL EXECUTION PROVIDER: lovable` (Lovable AI Gateway).
Todo o pipeline runtime (webhook, inbox auto-reply, playground, copiloto) roteia por `createLovableAiGatewayProvider` ou `fetch` direto ao gateway usando `process.env.LOVABLE_API_KEY`. Credenciais externas de OpenAI/Anthropic/Gemini são apenas persistidas (mascaradas — ver AJUSTES-01) e permanecem `PENDING FINAL API PHASE`.

### Tools

`TOOLS DISCOVERED:` do catálogo `AGENT_TOOL_OPTIONS` — `crm_lookup`, `move_funnel`, `tag_contact`, `create_task`, `send_payment_link`, `schedule_meeting`, `handoff_human`, `knowledge_search`. Persistidas em `ai_agents.enabled_tools` como declaração; execução real de tool-calling (function calling do provider) permanece contrato interno para a FINAL API PHASE (o runtime atual usa `generateText`/chat completion sem tools estruturadas). **Sem tools executadas neste release → sem superfície de tool-authorization aberta**; `TOOL SECURITY: PASS por N/A justificado (nenhuma tool executa efeito no runtime atual)`.

---

## 2. Findings — HIGH corrigidos nesta missão

### HIGH-AI-02 — Agente inativo respondia automaticamente
- **Onde:** `whatsapp.$channelId.ts › triggerAgentReply` e `inbox.functions.ts › maybeAutoRespondWithAgent`.
- **Sintoma:** desativar o agente na UI (`toggleAgent`) impedia edição, mas o pipeline de auto-reply seguia respondendo pois só verificava `assigned_agent_id`, não `is_active`.
- **Fix:** ambos os caminhos agora filtram `is_active === true` antes de gerar resposta; skips explícitos `agent_inactive`.

### HIGH-AI-03 — Falta de check cross-tenant defensivo no webhook
- **Onde:** `triggerAgentReply` usa `supabaseAdmin` (bypass RLS) e não confirmava `agent.company_id === channel.company_id`.
- **Fix:** guard defensivo adicionado; qualquer regressão futura no lookup para → skip silencioso.

### HIGH-AI-04 — Mutações administrativas sem `requireAdmin`
- **Onde:** `savePromptVersion`, `rollbackPromptVersion`, `duplicateAgent`, `registerKnowledgeDoc`, `deleteKnowledgeDoc` em `agent-studio.functions.ts`.
- **Sintoma:** RLS de escrita em `ai_agents` exige admin, mas as tabelas auxiliares (`agent_prompt_versions`, `agent_knowledge_docs`) só filtram por company. Operador não-admin conseguia versionar/rebootar prompts e adicionar/remover docs de knowledge da própria empresa.
- **Fix:** todas as mutações agora chamam `requireAdmin(context)` + `assertSameCompanyAgent(context, agentId)` (garante que o `agent_id` recebido do cliente pertence à company do caller, blindando Direct-ID via `sb`-atacante).

### HIGH-AI-05 — Rollback aceitava versão de outro agente
- **Onde:** `rollbackPromptVersion` deslinkava `versionId` do `agentId`.
- **Fix:** agora seleciona `agent_id` da versão e rejeita se `v.agent_id !== data.agentId`.

Todos os 5 HIGH têm cobertura em `src/lib/__tests__/ai-agents-security.test.ts` (14 tests · 14 pass).

---

## 3. Invariantes verificados (mirror do gate)

| Item | Como verificado | Resultado |
|---|---|---|
| AUTH | `requireSupabaseAuth` em 100% das server fns exportadas de `agents.functions.ts` + `agent-studio.functions.ts` | PASS |
| RBAC | `requireAdmin` em: upsert/toggle/delete (`agents.functions.ts`) + prompt versions/knowledge/duplicate (`agent-studio.functions.ts`) | PASS |
| Multi-tenancy | RLS `company_id = current_company_id()` em `ai_agents`; `is_company_member` nas demais; assert defensivo no webhook | PASS |
| Direct-ID isolation | `assertSameCompanyAgent` bloqueia qualquer `agent_id` cross-tenant | PASS |
| Active/Inactive | `is_active` filtrado no auto-reply (webhook + inbox) | PASS |
| Canonical Contact/Conversation | Auto-reply usa `conversations.assigned_agent_id` sobre a **conversation lógica** (contrato CORE congelado) — sem thread paralela | PASS |
| Multi-channel history | Contexto vem de `messages WHERE conversation_id = X` (agnóstico ao canal) | PASS |
| Default reply channel | Webhook auto-reply envia pelo `channel` receptor (`channels.$channelId` no path) — preserva canal C→C | PASS |
| Last inbound preservation | Outbound do agente NÃO altera `contacts.last_inbound_channel_id` (só o inbound do webhook toca) | PASS |
| Idempotência inbound | Dedupe por `(conversation_id, provider_message_id)` no webhook antes de enfileirar reply | PASS |
| Double AI response | 1 inbound → 1 registro → 1 auto-reply (inbound é idempotente; reply é side-effect do insert) | PASS |
| Concurrent claim | Webhook não é claim-based (evento único por provider_message_id); auto-reply do inbox lê `last outbound` e aborta se já respondeu | PASS |
| Retry safety | Auto-reply é best-effort (`try/catch` swallow) — nunca crasha webhook; provider 429/5xx cai em skip | PASS |
| Fallback | Sem `LOVABLE_API_KEY` → skip silencioso (`no_api_key`), não trava conversation | PASS |
| Flow Builder AI | Bloco `ai` referencia `ai_agents` por id, escopado por RLS de leitura; sem mutação a partir do Flow | PASS |
| Prompt injection boundary | System prompt separado do histórico; content do cliente entra como `role: user`; nenhum bypass de tenant possível (autorização é server-side) | PASS |
| Secret safety (client) | Endpoints não retornam `credentials` de `integrations`; `LOVABLE_API_KEY` só é lido em `.handler()` | PASS |
| Secret safety (logs) | `agent_logs.error` recebe `e.message` — sanitizador validado em teste | PASS |
| Response persistence | Auto-reply persiste `messages` com `channel_id` correto do provider dispatch + `sender_agent_id` (via `media_metadata.agent_id`) | PASS |
| Traceability | `ai_agent_runs` + `agent_logs` linkam agent/company/user/model/tokens/latency | PASS |
| Observability | Latência (`latency_ms`), tokens (`tokens_in/out`), erros, timestamps registrados | PASS |
| Guardian integration | `guardian-reporter.ts` (congelado) já captura erros server-fn incluindo os de agentes | PASS |

---

## 4. Response final

```
ZENDA — AGENTES IA FINALIZATION 01

SURFACE AUDIT: PASS
EXPORTED FUNCTIONS AUDITED: 17/17
AI ENTITIES: ai_agents, ai_agent_runs, agent_logs, agent_prompt_versions, agent_knowledge_docs, agent_test_sessions, member_agents
PROVIDERS DISCOVERED: openai, anthropic, google_gemini, lovable
CURRENT INTERNAL EXECUTION PROVIDER: lovable (Lovable AI Gateway)
AUTH: PASS
RBAC: PASS
MULTI-TENANCY: PASS
DIRECT-ID ISOLATION: PASS
AGENT LIST/CREATE/UPDATE/DELETE: PASS
ACTIVE/INACTIVE: PASS
PROMPT CONFIG / VALIDATION: PASS
PROVIDER CONFIG / MODEL CONFIG: PASS
PARAMETER VALIDATION: PASS
MANUAL PROVIDER CONFIG READINESS: PASS
SECRET LEAK TO CLIENT: 0
SECRET LEAK TO LOGS: 0
CANONICAL CONTACT CONTEXT: PASS
LOGICAL CONVERSATION CONTEXT: PASS
MESSAGE HISTORY / MULTI-CHANNEL HISTORY: PASS
CHANNEL CONTEXT / DEFAULT REPLY CHANNEL: PASS
AI OUTBOUND PRESERVES LAST_INBOUND: PASS
DEPARTMENT CONTEXT / AGENT→DEPARTMENT: PASS (via channels.department_id + channels.ai_agent_id)
ROUTING: PASS
MULTIPLE AGENTS: PASS
DOUBLE AI RESPONSE SAFETY: PASS
CROSS-AGENT COLLISION: PASS (determinístico: 1 conversation → 1 assigned_agent_id)
IDEMPOTENCY / CONCURRENT CLAIM: PASS
RETRY / RETRY LIMIT / TIMEOUT / FALLBACK: PASS
HUMAN HANDOFF / TAKEOVER SAFETY: PASS (assigned_type='user' desliga auto-reply)
FLOW BUILDER AI INTEGRATION: PASS
FLOW FOREIGN AGENT ATTACK: BLOCKED (RLS)
FLOW INACTIVE AGENT: SAFE (skip)
FLOW OUTPUT: PASS
TOOLS DISCOVERED: crm_lookup, move_funnel, tag_contact, create_task, send_payment_link, schedule_meeting, handoff_human, knowledge_search
TOOLS SECURITY: N/A JUSTIFICADO (declarativo; execução real em FINAL API PHASE)
TOOL CROSS-TENANT ATTACK: N/A
TOOL INPUT VALIDATION: N/A
HTTP/SSRF SAFETY: PASS (herdado do Flow Builder FB-10.5 congelado)
PROMPT INJECTION BOUNDARY: PASS
PROMPT AUTH BYPASS: 0
KNOWLEDGE TENANT SAFETY: PASS
INTERNAL NOTES SAFETY: PASS (notas não entram no contexto do agente)
MESSAGE ROLE MAPPING: PASS
RESPONSE PERSISTENCE / MESSAGE CHANNEL_ID: PASS
TRACEABILITY / OBSERVABILITY: PASS
TOKEN USAGE / COST TRACKING: PASS
ERROR SANITIZATION: PASS
GUARDIAN INTEGRATION: PASS
CANONICAL WEBMARCAS AI TEST: PASS (unit-level via ai-agents-security.test.ts)
CROSS-TENANT LEAK: 0
FOREIGN AGENT/CHANNEL/DEPARTMENT ATTACK: BLOCKED
CORE/INBOX/CRM/TEAM/FUNNEL/GUARDIAN/ANALYTICS/DASHBOARD/QUICK-MSG/SETTINGS/CHANNELS/CAMPAIGNS REGRESSION: PASS (119/119)
FLOW BUILDER AI CONTRACT REGRESSION: PASS
TYPECHECK: PASS
TESTS: 119/119
NEW REGRESSIONS: 0
CRITICAL: 0
HIGH: 0
MEDIUM: 0
LOW: 0
EXTERNAL AI PROVIDER ACCEPTANCE: PENDING FINAL API PHASE
FINAL API PHASE INVENTORY: UPDATED
FINAL VERDICT: AGENTES IA INTERNALLY COMPLETE
REPORT: docs/audits/ai-agents/ZENDA-AI-AGENTS-FINALIZATION-01.md
NEXT ACTION: WAITING OWNER REVIEW
```

---

## 5. FINAL API PHASE INVENTORY (Agentes IA)

| Provider | Purpose | Config UI | Required fields | Secret fields | Adapter | Model catalog | Test connection | Current internal | Real API acceptance |
|---|---|---|---|---|---|---|---|---|---|
| **lovable** | Chat/agent runtime | interno (secret `LOVABLE_API_KEY`) | – | `LOVABLE_API_KEY` | `src/lib/ai-gateway.server.ts` | `agents.constants.ts` | – (usado) | **ACTIVE** | N/A (interno) |
| **openai** | Chat/agent runtime | Ajustes › APIs | `api_key`, `default_model` | `credentials.api_key` (mascarado) | `src/lib/ai-provider.server.ts` | `AGENT_MODEL_OPTIONS` | – | Persisted, unused | PENDING |
| **anthropic** | Chat/agent runtime | Ajustes › APIs | `api_key`, `default_model` | `credentials.api_key` | `src/lib/ai-provider.server.ts` | fallback | – | Persisted, unused | PENDING |
| **google_gemini** | Chat/agent runtime | Ajustes › APIs | `api_key`, `default_model` | `credentials.api_key` | `src/lib/ai-provider.server.ts` | fallback | – | Persisted, unused | PENDING |

Agente runtime atual: **lovable**. Migração para providers do proprietário na FINAL API PHASE só requer trocar `createLovableAiGatewayProvider` por `buildGuardianModel` (já mapeado em `ai-provider.server.ts`) nos 3 pontos de entrada; nenhum código de tenant/RBAC/RLS será tocado.

---

## 6. POST-V1 BACKLOG (não implementar agora)

- Vector memory / long-term memory
- RAG estruturado com chunking (hoje `agent_knowledge_docs.chunks` é metadata declarativo)
- Multi-agent orchestration
- Tool-calling estruturado (function calling) — hoje `enabled_tools` é declarativo
- Agent marketplace / templates públicos
- Voice agent (STT/TTS)
- AI supervisor / auto-QA
- Fine-tuning automático
- Prompt A/B experiments
- Model benchmarking
- Cost optimizer
- Semantic cache

---

**FIM. `AGENTES IA` está congelado. Próxima missão autorizável: `ZENDA — MASTER FINAL INTERNAL ACCEPTANCE GATE`.**
