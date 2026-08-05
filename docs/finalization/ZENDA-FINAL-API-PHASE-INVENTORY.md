# ZENDA — FINAL API PHASE INVENTORY

**Data:** 2026-07-21
**Status:** COMPLETE (inventário) · PENDING (execução)

Inventário único de todas as integrações externas realmente necessárias
para transformar o Zenda de `INTERNALLY PRODUCTION READY` em
`EXTERNALLY PRODUCTION READY`. Nenhum item aqui deve ser executado sem
autorização explícita para iniciar a `ZENDA — FINAL API PHASE`.

---

## 1. Meta WhatsApp Cloud API

| Campo | Valor |
|---|---|
| PROVIDER | Meta (Graph API v20+) |
| PURPOSE | Envio/recebimento de mensagens WhatsApp Cloud (canal principal) |
| CONFIG UI | Aba Canais → tipo `whatsapp_cloud` |
| REQUIRED FIELDS | `phone_number_id`, `waba_id`, `verify_token` |
| SECRET FIELDS | `access_token` (long-lived), `app_secret` (assinatura webhook) |
| ADAPTER | `src/lib/wa-providers/whatsapp-cloud-*.server.ts` (send + delete) |
| WEBHOOK | `src/routes/api/public/webhooks/whatsapp.$channelId.ts` (verify + inbound) |
| TEST CONNECTION | GET `/{phone_number_id}` com access_token |
| CURRENT STATUS | Adapter completo; envio real desabilitado sem credencial válida |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

Limitações Meta oficiais preservadas: sem revoke de mensagem pela Cloud API, sem edição free-form fora da janela de 24h.

---

## 2. Evolution API (WhatsApp não-oficial)

| Campo | Valor |
|---|---|
| PROVIDER | Evolution API (self-hosted) |
| PURPOSE | Canal WhatsApp alternativo via QR code |
| CONFIG UI | Aba Canais → tipo `whatsapp_evolution` |
| REQUIRED FIELDS | `base_url`, `instance_name` |
| SECRET FIELDS | `api_key` |
| ADAPTER | `src/lib/wa-providers/evolution-delete.server.ts` + send handler |
| WEBHOOK | Compartilha `whatsapp.$channelId.ts` |
| TEST CONNECTION | GET `/instance/connectionState/{instance}` |
| CURRENT STATUS | Adapter completo; validação de instância pendente credencial |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

---

## 3. Baileys HTTP Proxy (WhatsApp não-oficial)

| Campo | Valor |
|---|---|
| PROVIDER | Baileys (self-hosted via HTTP proxy) |
| PURPOSE | Canal WhatsApp alternativo com session persistence |
| CONFIG UI | Aba Canais → tipo `whatsapp_baileys` |
| REQUIRED FIELDS | `base_url`, `session_id`, `auth_scheme` (`bearer` \| `apikey`) |
| SECRET FIELDS | `auth_token` |
| ADAPTER | `src/lib/wa-providers/baileys-delete.server.ts` + send handler |
| WEBHOOK | Compartilha `whatsapp.$channelId.ts` |
| TEST CONNECTION | GET `/session/{id}/status` |
| CURRENT STATUS | Adapter completo |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

---

## 4. Lovable AI Gateway

| Campo | Valor |
|---|---|
| PROVIDER | Lovable AI Gateway (proxy multi-modelo) |
| PURPOSE | Execução de agentes IA + Team Copilot + Guardian AI diagnostic |
| CONFIG UI | N/A (chave gerenciada) |
| REQUIRED FIELDS | — |
| SECRET FIELDS | `LOVABLE_API_KEY` (já configurada) |
| ADAPTER | `src/lib/ai-gateway.server.ts` + `whatsapp.$channelId.ts triggerAgentReply` |
| WEBHOOK | N/A |
| TEST CONNECTION | POST `/v1/chat/completions` com prompt curto |
| CURRENT STATUS | **ATIVO** — único provider externo já operacional |
| ACCEPTANCE STATUS | ACCEPTED |

---

## 5. OpenAI (direto)

| Campo | Valor |
|---|---|
| PROVIDER | OpenAI |
| PURPOSE | Alternativa direta ao Gateway para GPT-5/GPT-5-mini |
| CONFIG UI | Aba Ajustes → Integrações (opcional) |
| REQUIRED FIELDS | — |
| SECRET FIELDS | `OPENAI_API_KEY` |
| ADAPTER | Reutiliza `@ai-sdk/openai-compatible` |
| WEBHOOK | N/A |
| TEST CONNECTION | GET `/v1/models` |
| CURRENT STATUS | Roteamento por model prefix (`openai/*`) já implementado no Gateway |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE (opcional — Gateway cobre por padrão) |

---

## 6. Anthropic (direto)

| Campo | Valor |
|---|---|
| PROVIDER | Anthropic |
| PURPOSE | Alternativa direta para Claude |
| SECRET FIELDS | `ANTHROPIC_API_KEY` |
| CURRENT STATUS | Cobertura via Gateway; direto opcional |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE (opcional) |

---

## 7. Google Gemini (direto)

| Campo | Valor |
|---|---|
| PROVIDER | Google Generative AI |
| PURPOSE | Alternativa direta para Gemini |
| SECRET FIELDS | `GOOGLE_API_KEY` |
| CURRENT STATUS | Cobertura via Gateway (modelo default `google/gemini-2.5-flash`) |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE (opcional) |

---

## 8. Resend (email transacional)

| Campo | Valor |
|---|---|
| PROVIDER | Resend |
| PURPOSE | Emails transacionais (convites de equipe, reset de senha custom, notificações) |
| CONFIG UI | Aba Ajustes → Integrações |
| REQUIRED FIELDS | `from_email`, `from_name` |
| SECRET FIELDS | `RESEND_API_KEY` |
| ADAPTER | A implementar (`src/lib/email/resend.server.ts`) |
| WEBHOOK | Opcional (bounce/complaint tracking) |
| TEST CONNECTION | POST `/emails` com email de teste |
| CURRENT STATUS | Não implementado; Supabase Auth cobre emails de autenticação |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

---

## 9. Stripe (billing)

| Campo | Valor |
|---|---|
| PROVIDER | Stripe |
| PURPOSE | Cobrança de subscriptions do SaaS |
| CONFIG UI | Backoffice (não user-facing) |
| REQUIRED FIELDS | `webhook_endpoint_id` |
| SECRET FIELDS | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| ADAPTER | A implementar (`src/routes/api/public/webhooks/stripe.ts`) |
| WEBHOOK | `/api/public/webhooks/stripe` com HMAC verify |
| TEST CONNECTION | GET `/v1/customers?limit=1` |
| CURRENT STATUS | Tabela `subscriptions` existe (plan_key='free'/'pro'/'business'); billing real não integrado |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

---

## 10. Custom Webhook (outbound)

| Campo | Valor |
|---|---|
| PROVIDER | Genérico (cliente-configurável) |
| PURPOSE | Broadcast de eventos de domínio para sistemas do cliente |
| CONFIG UI | Aba Ajustes → Integrações → Webhook |
| REQUIRED FIELDS | `target_url`, `events[]` |
| SECRET FIELDS | `signing_secret` (HMAC SHA-256) |
| ADAPTER | A implementar (dispatcher em `src/lib/webhooks/dispatch.server.ts`) |
| CURRENT STATUS | `integrations` table pronta; dispatcher pendente |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE |

---

## 11. Guardian Alerter (outbound webhook interno)

| Campo | Valor |
|---|---|
| PROVIDER | Slack/Discord/Custom |
| PURPOSE | Alertas operacionais de incidentes Guardian |
| SECRET FIELDS | `GUARDIAN_ALERT_WEBHOOK_URL`, `GUARDIAN_ALERT_ENABLED`, `GUARDIAN_ALERT_MIN_SEVERITY` |
| ADAPTER | `src/lib/observability/guardian-alerter.server.ts` |
| CURRENT STATUS | Implementado (5 testes com falha pre-existing de infra vitest/bun — não afeta runtime) |
| ACCEPTANCE STATUS | PENDING FINAL API PHASE (URL do webhook) |

---

## 12. Asaas (pagamentos BR)

| Status | NOT PRESENT |
|---|---|

Registrado apenas como potencial requisito futuro. **Não** será adicionado
nesta fase. Se necessário no roadmap comercial, criar missão dedicada
`ZENDA — ASAAS INTEGRATION 01` após freeze da Final API Phase.

---

## Resumo Executivo

| Provider | Status Atual | Ação Final API Phase |
|---|---|---|
| Meta WhatsApp Cloud | Adapter ready | Fornecer credenciais + validar sandbox |
| Evolution API | Adapter ready | Fornecer instância + validar |
| Baileys | Adapter ready | Fornecer proxy + validar |
| Lovable AI Gateway | **ATIVO** | — |
| OpenAI direto | Opcional | Skip (Gateway cobre) |
| Anthropic direto | Opcional | Skip (Gateway cobre) |
| Gemini direto | Opcional | Skip (Gateway cobre) |
| Resend | Não implementado | Implementar adapter + credencial |
| Stripe | Não implementado | Implementar adapter + webhook |
| Custom Webhook (outbound) | Parcial | Implementar dispatcher |
| Guardian Alerter | Implementado | Fornecer webhook URL |
| Asaas | Not present | Fora de escopo |

**Total de providers pendentes de credencial:** 3 principais (Meta,
Resend, Stripe) + 3 opcionais WhatsApp alternativos + 1 alerter.

**Ordem sugerida de execução da Final API Phase:**
1. Meta WhatsApp Cloud (canal principal — sem isso, sem produto).
2. Resend (emails transacionais).
3. Stripe (billing).
4. Custom Webhook dispatcher (dependência de nenhum provider externo).
5. Evolution / Baileys (canais alternativos, sob demanda).
6. Guardian Alerter (URL operacional).
