# ZENDA — FINAL API CONNECTION PLAN

**Data:** 2026-07-21
**Missão:** ZENDA — FINAL API PHASE 00 (Provider Inventory & Connection Plan)
**Modo:** READ-ONLY (nenhum código, banco, migration ou credencial foi alterado)
**Global Freeze:** PRESERVED
**Fonte:** confronto entre `docs/finalization/ZENDA-FINAL-API-PHASE-INVENTORY.md`
e código real em `src/lib/**`, `src/routes/api/public/**`,
`src/integrations/supabase/types.ts`.

---

## 1. Providers descobertos no código

### Registry de canais (`src/lib/channels.functions.ts`)
Enum aceito pela UI da aba Canais:
`whatsapp_cloud`, `whatsapp_business`, `baileys`, `evolution`.

Observação: no runtime (`src/lib/wa-providers/index.server.ts`),
`whatsapp_business` é **alias operacional do adapter Cloud** — não é um
adapter independente. Não existe adapter separado para "WhatsApp Business
API On-Prem".

### Registry de integrações (`src/lib/integrations.functions.ts`)
Providers listados no catálogo `PROVIDERS`:
`resend`, `openai`, `anthropic`, `google_gemini`, `meta_whatsapp`,
`meta_instagram`, `meta_messenger`, `stripe`, `custom_webhook`.

### Runtime AI (`src/lib/ai-gateway.server.ts`)
Provider ativo em produção interna: **Lovable AI Gateway** (`LOVABLE_API_KEY`).

### Webhooks presentes em `src/routes/api/public/`
- `webhooks/whatsapp.$channelId.ts` — GET verify + POST inbound (Meta Cloud).
- `hooks/whatsapp-webhook.ts` — endpoint interno de bridge (Evolution / Baileys / genérico) com HMAC opcional.
- Nenhum webhook Instagram, Messenger, Stripe, Resend ou Custom outbound.

### Guardian Alerter (`src/lib/observability/guardian-alerter.server.ts`)
Configurável via env: `GUARDIAN_ALERT_WEBHOOK_URL`, `GUARDIAN_ALERT_ENABLED`, `GUARDIAN_ALERT_MIN_SEVERITY`.

---

## 2. Classificação (A / B / C / D / E)

| Provider | Classe | Justificativa |
|---|---|---|
| Meta WhatsApp Cloud | **A — obrigatório** | Canal principal; sem ele o produto não opera. |
| Lovable AI Gateway | **A — obrigatório** | Já ativo; roda agentes IA, Team Copilot, Guardian. |
| Evolution API | **B — específico** | Canal WhatsApp alternativo (não-oficial). |
| Baileys HTTP proxy | **B — específico** | Canal WhatsApp alternativo. |
| Resend | **B — específico** | Emails transacionais (convites, notificações). |
| Stripe | **B — específico** | Billing SaaS. |
| Custom Webhook (outbound) | **C — opcional** | Broadcast de eventos ao cliente. |
| Guardian Alerter webhook | **C — opcional** | Alertas operacionais. |
| OpenAI direto | **D — presente, não necessário** | Coberto pelo Gateway. |
| Anthropic direto | **D — presente, não necessário** | Coberto pelo Gateway. |
| Google Gemini direto | **D — presente, não necessário** | Coberto pelo Gateway. |
| `whatsapp_business` (enum) | **D — presente, não necessário** | Alias do Cloud, não é adapter independente. |
| Meta Instagram | **E — placeholder / registry only** | Item de catálogo com testConnection genérico Graph API; sem adapter de envio nem webhook inbound. |
| Meta Messenger | **E — placeholder / registry only** | Igual Instagram. |
| Asaas | **NOT PRESENT** | Fora de escopo; backlog. |

---

## 3. WhatsApp — decisão

**RECOMMENDED PRODUCTION WHATSAPP PROVIDER: `whatsapp_cloud` (Meta Cloud API v20).**

Motivos:
- Único com adapter completo (`whatsapp-cloud.server.ts` + `whatsapp-cloud-delete.server.ts`).
- Único com webhook real (`webhooks/whatsapp.$channelId.ts`) com verify + HMAC + idempotência + contato canônico + conversa lógica + stop-on-reply.
- `whatsapp_business` é alias operacional do mesmo adapter (não é implementação nativa da WhatsApp Business API On-Prem).
- Evolution / Baileys são adapters funcionais, mas dependem de infraestrutura self-hosted do cliente; classificados como B.

---

## 4. Meta WhatsApp Cloud — campos reais

| Campo | Origem no código | Secret | UI |
|---|---|---|---|
| `phone_number_id` | `channels.credentials.phone_number_id` | não | Canais → detalhe WA Cloud |
| `waba_id` | `channels.credentials.waba_id` | não | Canais → detalhe WA Cloud |
| `access_token` | `channels.credentials.access_token` | **sim** | Canais → detalhe WA Cloud |
| `app_secret` | `channels.credentials.app_secret` | **sim** | Canais → detalhe WA Cloud |
| `webhook_verify_token` | `channels.webhook_verify_token` | não (público na config do Meta) | Canais → detalhe WA Cloud |

- Armazenamento: coluna `credentials` (JSONB) da tabela `channels`; nunca retornada ao browser em plaintext (mascarada por `getChannel`).
- Consumer send: `src/lib/wa-providers/whatsapp-cloud.server.ts`.
- Consumer delete: `whatsapp-cloud-delete.server.ts`.
- Consumer receive: `src/routes/api/public/webhooks/whatsapp.$channelId.ts`.
- Test connection: registry `integrations` usa `GET graph.facebook.com/v20.0/me`; para o canal em si, a validação real é o webhook GET verify + primeiro POST inbound.

---

## 5. WhatsApp Webhook

**URL esperada** (por canal, tenant-safe):

```
https://talkebase.lovable.app/api/public/webhooks/whatsapp/{channelId}
```

Preview (para sandbox Meta):
```
https://project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app/api/public/webhooks/whatsapp/{channelId}
```

| Item | Status |
|---|---|
| GET verification (`hub.mode` / `hub.verify_token` / `hub.challenge`) | **READY** |
| POST inbound | **READY** |
| HMAC verification (`x-hub-signature-256` + `app_secret`) | **READY** (rejeita se `app_secret` ausente) |
| Idempotency (dedupe por `message_id`) | **READY** |
| Canonical contact (E.164 unificado) | **READY** |
| Logical conversation (1 contato → 1 conversa) | **READY** |
| Stop-on-reply cross-channel | **READY** |

---

## 6. AI Providers

| Provider | Implemented | Requires user key | Config UI | Required fields | Secret fields | Model config | Test connection | Provider Acceptance possible |
|---|---|---|---|---|---|---|---|---|
| Lovable AI Gateway | **YES** | NO | N/A (gerenciado) | — | `LOVABLE_API_KEY` (auto) | via prefixos `google/*`, `openai/*` | chat completion curta | **YES** (já ACCEPTED) |
| OpenAI direto | PARTIAL (registry + testConnection) | YES | Ajustes → Integrações | `api_key` | `api_key` | `default_model` | `GET /v1/models` | YES (opcional) |
| Anthropic direto | PARTIAL (registry + testConnection) | YES | Ajustes → Integrações | `api_key` | `api_key` | `default_model` | `GET /v1/models` | YES (opcional) |
| Google Gemini direto | PARTIAL (registry + testConnection) | YES | Ajustes → Integrações | `api_key` | `api_key` | `default_model` | `GET /v1beta/models` | YES (opcional) |

Runtime real de agentes / copiloto / guardian usa **exclusivamente Lovable AI Gateway**. Os itens diretos existem no catálogo `integrations` mas nenhum código de produção os consome como rota de execução. Devem ser mantidos como fallback opcional; não bloqueiam a Final API Phase.

---

## 7. Lovable AI Gateway — status em produção

- **Continuará funcionando em produção:** sim; `LOVABLE_API_KEY` é auto-provisionada por projeto Lovable.
- **Configuração adicional:** nenhuma; o `.env` do runtime já resolve `process.env.LOVABLE_API_KEY`.
- **Billing / créditos:** o workspace consome créditos AI Gateway; o proprietário precisa ter plano/créditos adequados para volume de produção.
- **Papel:** deve permanecer como **provider principal** de IA. OpenAI/Anthropic/Gemini diretos permanecem como fallback opcional configurável pela UI (não substituem o Gateway).
- **Alteração:** **nenhuma nesta missão** — apenas informativo.

---

## 8. Email — Resend

| Item | Valor |
|---|---|
| Implementado | PARTIAL — presente no registry `integrations` com testConnection (`GET https://api.resend.com/domains`); **sem** adapter de envio (`src/lib/email/resend.server.ts` **não existe**). |
| Funcionalidades que usariam | Convites de equipe, reset de senha custom, notificações operacionais, futuras campanhas por email. |
| Campanhas dependem? | **Não.** Campanhas atuais só disparam via canais WhatsApp; nenhum código de broadcast lê Resend. |
| Opcional? | Sim para o MVP interno. Emails de autenticação seguem via Lovable Cloud/Supabase Auth padrão. |
| Required fields | `api_key` (secret), `from_email` (config). |

---

## 9. Stripe

| Item | Valor |
|---|---|
| Necessário para operar Zenda internamente? | **NÃO.** Nenhum path de produto (Inbox, Flow, Campanhas, Agentes) exige Stripe. |
| Necessário para billing SaaS? | **SIM**, quando o proprietário abrir cobrança de planos. Tabela `subscriptions` já existe (`plan_key`: `free` / `pro` / `business`). |
| Required fields | `secret_key` (secret), `publishable_key` (config). |
| Webhook | **Não existe rota.** Precisa ser criada em `src/routes/api/public/webhooks/stripe.ts` com verify por `STRIPE_WEBHOOK_SECRET`. |
| Test connection | `GET https://api.stripe.com/v1/account` (implementado). |
| Billing dependency | Só entra quando ativar cobrança; até lá, opcional. |

---

## 10. Asaas

**NOT PRESENT** — confirmado. Nenhuma referência no código.
Se necessário no roadmap comercial: criar missão dedicada
`ZENDA — ASAAS INTEGRATION 01` **após** o freeze da Final API Phase.
**BACKLOG.**

---

## 11. Custom Webhook

| Aspecto | Estado |
|---|---|
| Entrada (inbound genérico) | Existe endpoint em `src/routes/api/public/hooks/whatsapp-webhook.ts` para bridge WhatsApp com HMAC opcional (`WHATSAPP_WEBHOOK_SECRET`). |
| Saída (outbound / dispatcher) | **NÃO implementado.** Registry `integrations.custom_webhook` só grava `target_url` e testConnection; não há dispatcher em `src/lib/webhooks/dispatch.server.ts`. |
| Assinatura / secret | Definida no registry (HMAC SHA-256), sem consumer. |
| SSRF guard | Existe globalmente em `src/lib/security/ssrf-guard` para nós HTTP do Flow Builder; **não** aplicado ao dispatcher (que não existe). |
| Retry / idempotência | Não implementado. |
| Classificação | **OPTIONAL** (C). Habilitar somente sob demanda; requer implementação do dispatcher antes da conexão. |

---

## 12. Meta Instagram / Messenger

| Provider | Status |
|---|---|
| `meta_instagram` | **REGISTRY ONLY** — item no catálogo `PROVIDERS` com `testConnection` genérico via `GET graph.facebook.com/v20.0/me`. Sem adapter de envio, sem webhook inbound, sem código de canal. |
| `meta_messenger` | **REGISTRY ONLY** — idem. |

Não devem ser conectados nesta fase.

---

## 13. Credenciais — tabela consolidada

| Provider | Field | Required | Secret | Config Location | Storage | Consumer | Test Connection |
|---|---|---|---|---|---|---|---|
| WA Cloud | `phone_number_id` | YES | no | Canais → WA Cloud | `channels.credentials` | `whatsapp-cloud.server.ts` | Graph `/me` + verify webhook |
| WA Cloud | `waba_id` | YES | no | Canais → WA Cloud | `channels.credentials` | adapter | idem |
| WA Cloud | `access_token` | YES | **YES** | Canais → WA Cloud | `channels.credentials` (mascarada) | adapter + webhook | idem |
| WA Cloud | `app_secret` | YES | **YES** | Canais → WA Cloud | `channels.credentials` | webhook HMAC | verify HMAC no primeiro POST |
| WA Cloud | `webhook_verify_token` | YES | no | Canais → WA Cloud | `channels.webhook_verify_token` | GET verify | GET handshake Meta |
| Evolution | `base_url` | YES | no | Canais → Evolution | `channels.credentials` | `evolution-delete.server.ts` + send | `/instance/connectionState/{instance}` |
| Evolution | `instance_name` | YES | no | Canais → Evolution | `channels.credentials` | adapter | idem |
| Evolution | `api_key` | YES | **YES** | Canais → Evolution | `channels.credentials` | adapter | idem |
| Baileys | `base_url` | YES | no | Canais → Baileys | `channels.credentials` | `baileys-delete.server.ts` + send | `/session/{id}/status` |
| Baileys | `session_id` | YES | no | Canais → Baileys | `channels.credentials` | adapter | idem |
| Baileys | `auth_scheme` | YES | no | Canais → Baileys | `channels.credentials` | adapter | idem |
| Baileys | `auth_token` | YES | **YES** | Canais → Baileys | `channels.credentials` | adapter | idem |
| Lovable AI Gateway | `LOVABLE_API_KEY` | YES | **YES** | Auto (managed) | project secret | `ai-gateway.server.ts` | chat completion curta |
| OpenAI direto | `api_key` | opt | **YES** | Ajustes → Integrações | `integrations.credentials` | (fallback opcional) | `GET /v1/models` |
| Anthropic direto | `api_key` | opt | **YES** | Ajustes → Integrações | `integrations.credentials` | (fallback opcional) | `GET /v1/models` |
| Gemini direto | `api_key` | opt | **YES** | Ajustes → Integrações | `integrations.credentials` | (fallback opcional) | `GET /v1beta/models` |
| Resend | `api_key` | YES | **YES** | Ajustes → Integrações | `integrations.credentials` | (adapter a implementar) | `GET /domains` |
| Resend | `from_email` | YES | no | Ajustes → Integrações | `integrations.config` | (adapter a implementar) | — |
| Stripe | `secret_key` | YES | **YES** | Ajustes → Integrações | `integrations.credentials` | (webhook a implementar) | `GET /v1/account` |
| Stripe | `publishable_key` | YES | no | Ajustes → Integrações | `integrations.credentials` | client-side checkout | — |
| Stripe | `STRIPE_WEBHOOK_SECRET` | YES (quando webhook existir) | **YES** | env (dispatcher futuro) | project secret | webhook a implementar | verify HMAC |
| Custom Webhook | `target_url` | YES | no | Ajustes → Integrações | `integrations.config` | dispatcher a implementar | POST ping |
| Custom Webhook | `signing_secret` | YES | **YES** | Ajustes → Integrações | `integrations.credentials` | dispatcher a implementar | HMAC do payload |
| Guardian Alerter | `GUARDIAN_ALERT_WEBHOOK_URL` | opt | **YES** | env / project secret | project secret | `guardian-alerter.server.ts` | POST ping |
| Guardian Alerter | `GUARDIAN_ALERT_ENABLED` | opt | no | env | project secret | idem | — |
| Guardian Alerter | `GUARDIAN_ALERT_MIN_SEVERITY` | opt | no | env | project secret | idem | — |

Nenhuma credencial real aparece neste documento.

---

## 14. Secret storage

- **WhatsApp (todos os providers), Meta Instagram/Messenger, Resend, OpenAI/Anthropic/Gemini diretos, Stripe (chaves de API), Custom Webhook:** UI administrativa do próprio Zenda (Aba Canais ou Aba Ajustes → Integrações). Armazenados em `channels.credentials` ou `integrations.credentials` (JSONB), mascarados no retorno ao browser.
- **Lovable AI Gateway (`LOVABLE_API_KEY`):** managed secret — nunca inserido manualmente.
- **`STRIPE_WEBHOOK_SECRET`:** exige project secret (env) porque é lido dentro do handler do webhook, antes de tocar em `integrations`. Deve ser adicionado via ferramenta de secrets, não via UI Zenda. **Único caso env-only.**
- **Guardian Alerter (`GUARDIAN_ALERT_*`):** hoje env-only. Pode migrar para UI no futuro; não bloqueia esta fase.

Nenhum provider exige `.env` local em código, hardcode, migration, ou insert manual em DB.

---

## 15. Connection tests (a executar DEPOIS de credenciais entrarem)

- **WA Cloud:** (1) `GET graph.facebook.com/v20.0/{phone_number_id}` com access_token; (2) GET verify webhook (handshake Meta); (3) POST inbound de teste com HMAC válido → confirmar contato canônico + conversa lógica; (4) envio outbound de texto; (5) stop-on-reply cross-channel.
- **Evolution:** `GET /instance/connectionState/{instance}`; envio de texto; recepção via bridge webhook.
- **Baileys:** `GET /session/{id}/status`; envio de texto; recepção via bridge webhook.
- **Lovable AI Gateway:** chat completion de 1 turno (já validada em produção).
- **OpenAI/Anthropic/Gemini diretos:** model listing (opcional).
- **Resend:** `GET /domains`; envio de email de teste após adapter existir.
- **Stripe:** `GET /v1/account`; POST de evento de teste no webhook após rota existir.
- **Custom Webhook:** POST ping; validação de assinatura no receiver.
- **Guardian Alerter:** POST ping para a URL configurada.

---

## 16. Provider Acceptance — critérios objetivos

**WhatsApp Cloud:**
AUTH PASS · PHONE NUMBER PASS · WABA PASS · OUTBOUND PASS · INBOUND PASS · WEBHOOK PASS · CANONICAL CONTACT PASS · LOGICAL CONVERSATION PASS · STOP-ON-REPLY PASS.

**Evolution / Baileys:**
AUTH PASS · SESSION PASS · OUTBOUND PASS · INBOUND PASS (bridge) · CANONICAL CONTACT PASS · LOGICAL CONVERSATION PASS · STOP-ON-REPLY PASS.

**Lovable AI Gateway:** AUTH PASS · COMPLETION PASS · CREDITS AVAILABLE PASS (já ACCEPTED).

**OpenAI / Anthropic / Gemini diretos (opt):** AUTH PASS · MODEL LIST PASS.

**Resend:** AUTH PASS · DOMAIN VERIFIED PASS · TEST EMAIL DELIVERED PASS *(bloqueado até adapter existir)*.

**Stripe:** AUTH PASS · WEBHOOK VERIFY PASS · TEST EVENT PROCESSED PASS *(bloqueado até webhook existir)*.

**Custom Webhook:** PING PASS · HMAC PASS *(bloqueado até dispatcher existir)*.

**Guardian Alerter:** PING PASS.

---

## 17. Ordem recomendada de integração

Com base nas dependências reais do código:

**PHASE 1 — COMMUNICATION CORE**
1. Meta WhatsApp Cloud (canal principal — sem isso, sem produto).
2. Evolution API (sob demanda, canal alternativo).
3. Baileys HTTP proxy (sob demanda, canal alternativo).

**PHASE 2 — AI**
4. Lovable AI Gateway (validar créditos do workspace para produção — nenhuma outra ação).
5. OpenAI / Anthropic / Gemini diretos (opcional — só se o proprietário quiser fallback fora do Gateway).

**PHASE 3 — EMAIL**
6. Resend (requer implementação do adapter antes da conexão).

**PHASE 4 — BILLING**
7. Stripe (requer implementação do webhook + `STRIPE_WEBHOOK_SECRET`).

**PHASE 5 — OPTIONAL PROVIDERS**
8. Custom Webhook (requer implementação do dispatcher).
9. Guardian Alerter (URL operacional).
10. Meta Instagram / Messenger — **não** nesta fase (placeholder).
11. Asaas — backlog.

---

## 18. Provider-Integration Blockers

Nenhum blocker interno **Critical/High** foi encontrado; o Global Freeze
permanece intacto.

Ítens que **não** são blockers de integração mas exigem trabalho antes da
conexão real do provider correspondente:

- Resend: adapter de envio (`src/lib/email/resend.server.ts`) inexistente.
- Stripe: rota `src/routes/api/public/webhooks/stripe.ts` inexistente.
- Custom Webhook: dispatcher (`src/lib/webhooks/dispatch.server.ts`) inexistente.
- Meta Instagram/Messenger: adapters e webhooks inexistentes.

Todos ficam registrados como **PROVIDER-INTEGRATION WORK** (não corrigir nesta missão).

---

## 19. Primeiro provider a conectar

**Meta WhatsApp Cloud API** — via aba **Canais → novo canal `whatsapp_cloud`**, preencher `phone_number_id`, `waba_id`, `access_token`, `app_secret`, `webhook_verify_token`; configurar no painel Meta o webhook URL exibido acima; executar Provider Acceptance completo do WhatsApp.
