# ZENDA — AJUSTES FINALIZATION 01

**Data:** 2026-07-21
**Missão:** Auditoria + correção + validação + segurança + gate final + freeze da área **Ajustes**.
**Regra global:** estrutura pronta agora; **APIs reais na Fase Final**.

---

## 1. Superfície mapeada

### Rotas
| Rota | Arquivo | Descrição |
|---|---|---|
| `/settings` | `src/routes/_authenticated.settings.index.tsx` | Layout com abas Workspace / Perfil / Notificações / APIs / Feature Flags |
| `/settings/feature-flags` | `src/routes/_authenticated.settings.feature-flags.tsx` | Painel de feature flags |
| `/settings/features` | `src/routes/_authenticated.settings.features.tsx` | Catálogo somente leitura do FEATURES registry |
| `/settings/audit` | `src/routes/_authenticated.settings.audit.tsx` | Audit log da workspace |

Todas sob o gate `_authenticated` (redireciona para `/auth` sem sessão).

### Componentes
- `src/components/settings/apis-panel.tsx` — CRUD de integrações + webhook display
- `src/components/settings/feature-flags-panel.tsx` — CRUD de flags
- `src/components/settings/guardian-panel.tsx` — configurações do Guardião (área FROZEN, apenas leitura aqui)

### Server functions (client-callable)
| Função | Arquivo | Auth | RBAC | Tenant |
|---|---|---|---|---|
| `getWorkspace` | `src/lib/settings.functions.ts` | `requireSupabaseAuth` | any-member | `.eq(company_id)` derivado do JWT |
| `updateWorkspace` | idem | `requireSupabaseAuth` | `requireAdmin` | idem |
| `updateProfile` | idem | `requireSupabaseAuth` | self-only (`eq(id, userId)`) | N/A |
| `updateNotificationPrefs` | idem | `requireSupabaseAuth` | self-only | N/A |
| `getIntegrationsStatus` | idem | `requireSupabaseAuth` | any-member (read-only status) | N/A |
| `listIntegrations` | `src/lib/integrations.functions.ts` | `requireSupabaseAuth` | via RLS (admin) | `.eq(company_id)` |
| `getIntegrationForEdit` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` |
| `upsertIntegration` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` |
| `toggleIntegration` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` |
| `deleteIntegration` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` |
| `regenerateWebhookSecret` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` |
| `testIntegration` | idem | `requireSupabaseAuth` | `requireAdmin` | `.eq(company_id)` — **PENDING FINAL API PHASE** para verificação real |
| `listFeatureFlags` / `upsertFeatureFlag` / `deleteFeatureFlag` | `src/lib/feature-flags.functions.ts` | `requireSupabaseAuth` | via RBAC/registry | RLS `company_id` |

### Tabelas
- `companies` (RLS: is_company_member)
- `profiles` (RLS: self)
- `user_roles` (RLS + `has_role`)
- `integrations` (RLS revisada nesta missão — ver §3)
- `feature_flags` (RLS `company_id`)
- `team_audit_log` (append-only, RLS `company_id`)
- `plan_limits`, `subscriptions`, `onboarding_progress` (billing interno)

---

## 2. Classificação (A / B / C)

| Configuração | Classe | Observação |
|---|---|---|
| Workspace (nome/tz/locale) | A INTERNAL | Validado |
| Perfil (nome/avatar) | A INTERNAL | Validado |
| Notificações (prefs JSON) | A INTERNAL | Validado |
| Feature Flags | A INTERNAL | Validado (área já coberta em missões anteriores) |
| Audit Log (visualização) | A INTERNAL | Validado |
| Integrações — **estrutura** (CRUD, secret storage, masking, webhook) | A INTERNAL | Validado nesta missão |
| Integrações — **teste real de provider** | B EXTERNAL-READY | `testIntegration` faz HTTP real; classificado **PENDING FINAL API PHASE** |
| Billing / Planos (subscriptions/plan_limits) | B EXTERNAL-READY | Estrutura interna presente; Stripe/Asaas não plugados |
| Stripe / Asaas / Resend / OpenAI / Anthropic / Gemini / Meta providers | B EXTERNAL-READY | Provider registry existe, credenciais serão inseridas na Fase Final |

Nenhum item classe C (legacy) sinalizado nesta missão.

---

## 3. Correções aplicadas

### HIGH-1 — RLS de `integrations` permitia qualquer membro ler credenciais
**Antes:** política `"Members can view company integrations"` com `USING (is_company_member(company_id))` — qualquer membro autenticado podia executar `select * from integrations` via cliente browser e obter `credentials` em plaintext (bypassando `listIntegrations` que já mascara).

**Correção (migration aplicada):**
```sql
DROP POLICY "Members can view company integrations" ON public.integrations;
CREATE POLICY "Admins can view company integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (is_company_member(company_id) AND has_role(auth.uid(), 'admin'::app_role));
```

Impacto no produto: `listIntegrations`/`getIntegrationForEdit` já eram admin-only via `requireAdmin`. `getIntegrationsStatus` **não** lê a tabela `integrations` (usa `process.env`), portanto não é afetado. Cliente browser (chave publishable) não consegue mais bypassar server functions para ler segredos.

### HIGH-2 — `getIntegrationForEdit` devolvia credenciais em plaintext ao cliente
**Antes:** endpoint retornava `credentials: row.credentials` inteiro — apesar do formulário do painel iniciar todos os campos secretos vazios (o merge de upsert já preserva), o payload de rede continha `api_key`, `access_token`, `secret_key`, `app_secret`, `page_access_token` em texto pleno.

**Correção:** o handler agora percorre `PROVIDERS[provider].credentialFields`, remove do payload todo campo `secret: true` e devolve apenas o flag booleano `credentials_configured[key]`. Campos operacionais gerados pelo próprio Zenda (`verify_token`, `webhook_secret`) continuam em texto pleno porque o administrador precisa copiá-los para o painel do provider externo.

Diff: `src/lib/integrations.functions.ts` (bloco `getIntegrationForEdit`).

---

## 4. Auditoria de segurança

| Item | Resultado |
|---|---|
| Auth em toda função client-callable | ✅ |
| RBAC (admin) para mutações sensíveis | ✅ |
| Multi-tenancy via RLS + `.eq(company_id)` no server | ✅ |
| Direct-ID attack (Company A → UUID Company B) | ✅ bloqueado (RLS + `.eq(company_id)` combinados) |
| Mass assignment (`company_id`, `owner_id`) | ✅ Zod schemas explícitos, sem `.passthrough()` |
| Secret storage | ✅ JSONB `credentials` protegido por RLS admin-only |
| Secret masking em listagens | ✅ `mask()` cobre todos os campos de `credentialFields` |
| Secret masking em edição | ✅ corrigido nesta missão (HIGH-2) |
| Secret preservation em edit parcial | ✅ merge no upsert (campos vazios não sobrescrevem) |
| Secret rotation | ✅ novo valor substitui (mesmo caminho de upsert); `regenerateWebhookSecret` para webhook |
| Secret delete | ✅ `deleteIntegration` remove a row inteira |
| Log redaction | ✅ nenhum `console.log(creds.*)` no código server-side |
| Error sanitization | ✅ erros são apenas `error.message` do provider externo; sem dump de credencial |
| Cache tenant safety (React Query) | ✅ chaves `["integration-edit", id]` + invalidate em sign-out (root subscriber) |

---

## 5. UX / regressão

| Item | Resultado |
|---|---|
| Empty state (empresa sem integração) | ✅ painel mostra "nenhuma integração configurada" |
| Loading state | ✅ skeleton em `settings/index` |
| Error state | ✅ `errorComponent` por rota isola falhas |
| Partial failure (uma integração quebrada) | ✅ isolada no card, não derruba painel |
| Double submit | ✅ `saveMut.isPending` desabilita botão |
| Mobile 390px | ✅ tabs responsivas |

Regressões automáticas (`bunx vitest run`) das áreas congeladas: todas verdes (nenhuma alteração fora de `integrations.functions.ts` + RLS policy da tabela `integrations`).

---

## 6. Testes

Arquivo novo: `src/lib/__tests__/integrations-secret-safety.test.ts` — **7/7 PASS**.
Cobre: mask, list masking, edit sem plaintext de secret, verify_token exibido, preservação de credencial, rotação, contrato geral de secret fields do `PROVIDERS` registry.

---

## 7. FINAL API PHASE INVENTORY

Providers reconhecidos pelo produto (fonte única: `PROVIDERS` em `src/lib/integrations.functions.ts`). **Nenhum foi conectado nesta missão.**

### Resend (E-mail transacional)
- PURPOSE: envio de e-mails transacionais / broadcasts
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `api_key` (secret), `from_email`
- SECRET FIELDS: `api_key`
- CONFIGURATION UI: `/settings` → aba APIs → provider `resend`
- SERVER ADAPTER: `src/lib/integrations.functions.ts` (case `resend` em `testIntegration`)
- TEST CONNECTION: `GET https://api.resend.com/domains`
- WEBHOOK REQUIRED: NO
- WEBHOOK ROUTE: N/A
- FINAL ACCEPTANCE TEST: enviar 1 e-mail transacional real e confirmar recebimento

### OpenAI
- PURPOSE: modelos GPT para agentes IA e Guardião
- STATUS: NOT CONFIGURED (Zenda usa Lovable AI Gateway por padrão)
- REQUIRED FIELDS: `api_key` (secret), `default_model`
- SECRET FIELDS: `api_key`
- CONFIGURATION UI: `/settings` → APIs → `openai`
- SERVER ADAPTER: idem
- TEST CONNECTION: `GET https://api.openai.com/v1/models`
- WEBHOOK REQUIRED: NO
- FINAL ACCEPTANCE TEST: completion round-trip real

### Anthropic (Claude)
- PURPOSE: modelos Claude
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `api_key` (secret), `default_model`
- SECRET FIELDS: `api_key`
- TEST CONNECTION: `GET https://api.anthropic.com/v1/models` com `x-api-key`
- FINAL ACCEPTANCE TEST: completion round-trip real

### Google Gemini
- PURPOSE: modelos Gemini
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `api_key` (secret), `default_model`
- SECRET FIELDS: `api_key`
- TEST CONNECTION: `GET generativelanguage.googleapis.com/v1beta/models?key=…`
- FINAL ACCEPTANCE TEST: completion round-trip real

### Meta WhatsApp Cloud API
- PURPOSE: canal WhatsApp oficial (provider principal do produto)
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `access_token` (secret), `app_secret` (secret, opcional), `phone_number_id`, `waba_id`
- SECRET FIELDS: `access_token`, `app_secret`
- CONFIGURATION UI: `/settings` → APIs → `meta_whatsapp`
- SERVER ADAPTER: `testIntegration` (case `meta_whatsapp`) + `src/routes/api/public/webhooks/whatsapp.$channelId.ts`
- TEST CONNECTION: `GET graph.facebook.com/v20.0/me`
- WEBHOOK REQUIRED: YES
- WEBHOOK ROUTE: `/api/public/webhooks/meta-whatsapp/{integrationId}` (verify_token + webhook_secret gerados no upsert)
- FINAL ACCEPTANCE TEST: enviar/receber mensagem real com número de teste da Meta; validar HMAC do webhook

### Meta Instagram / Meta Messenger
- PURPOSE: canais de DM Meta
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `page_access_token` (secret), `page_id`
- SECRET FIELDS: `page_access_token`
- WEBHOOK REQUIRED: YES
- WEBHOOK ROUTE: `/api/public/webhooks/meta-instagram/{id}` e `/meta-messenger/{id}`
- FINAL ACCEPTANCE TEST: envio/recebimento de DM real

### Stripe
- PURPOSE: cobrança / assinatura
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `secret_key` (secret), `publishable_key`
- SECRET FIELDS: `secret_key`
- TEST CONNECTION: `GET https://api.stripe.com/v1/account`
- WEBHOOK REQUIRED: YES (checkout.session.completed, invoice.paid, customer.subscription.*)
- WEBHOOK ROUTE: `/api/public/webhooks/stripe/{integrationId}` — validar assinatura HMAC com `webhook_secret`
- FINAL ACCEPTANCE TEST: checkout real em modo test → webhook → atualização de `subscriptions`

### Custom Webhook (outbound)
- PURPOSE: enviar eventos do Zenda para URL do cliente
- STATUS: NOT CONFIGURED
- REQUIRED FIELDS: `target_url`
- SECRET FIELDS: nenhum (assinatura HMAC via `webhook_secret` interno)
- FINAL ACCEPTANCE TEST: POST real para URL do cliente e validar assinatura HMAC no destino

**Não presentes:** Asaas (registry atual não expõe; POST-V1 se for necessário para o piloto WebMarcas), WhatsApp Business On-Prem, Evolution, Baileys (canais alternativos, geridos em Canais — missão separada).

---

## 8. POST-V1 BACKLOG (não bloqueante)

- UI de histórico de rotações de segredo (versionamento visual)
- Approval workflow para trocar credencial de produção (dupla assinatura)
- SSO enterprise (SAML/OIDC customizado)
- Diff viewer de configurações
- Suporte a Asaas se o piloto exigir cobrança BR-nativa
- Migração para vault dedicado (KMS) para `credentials` — hoje protegido apenas por RLS + backup criptografado do Postgres

---

## 9. Veredito

- CRITICAL: 0
- HIGH: 0 (2 encontrados e corrigidos nesta missão)
- MEDIUM: 0
- LOW: 0
- Regressões novas: 0
- Typecheck: PASS
- Tests: 7/7 novos + regressão áreas congeladas PASS

**AJUSTES INTERNALLY COMPLETE / FROZEN.**
Provider Acceptance dos providers externos: **PENDING FINAL API PHASE**.
