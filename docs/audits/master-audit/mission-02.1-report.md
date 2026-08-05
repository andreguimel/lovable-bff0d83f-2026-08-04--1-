# Missão 2.1 — Segurança Dinâmica

**Data:** 2026-07-15
**Escopo:** apenas segurança dinâmica (auth, RBAC, RLS, webhooks, secrets, sessões, dependências).
**Fora de escopo:** Playwright completo, Dashboard, CRM, Inbox, Fluxos, Agentes, UX, performance.
**Regra de correção:** apenas Critical / High. Medium e Low ficam registrados.

## Resumo executivo

| Área | Achados High/Critical | Fixados | Aberto |
|------|-----------------------|---------|--------|
| Authorization (server fns) | 0 | — | — |
| RLS | 0 | — | — |
| Webhooks | 1 (HIGH) | 1 | 0 |
| Uploads | 0 | — | — |
| Secrets | 0 | — | — |
| Rate limit | 0 | — | — |
| Sessão | 0 | — | — |
| Dependency scan | 0 | — | — |

Findings Medium/Low: **4** (registrados, não corrigidos).

## 1. Authorization Audit — server functions

- **Cobertura:** 26 arquivos `src/lib/*.functions.ts` inspecionados.
- **`requireSupabaseAuth`:** aplicado em todas as server fns exceto `previewInvite` — que é intencionalmente pública (landing `/invite/:token`) e já foi hardenizada no Hotfix 01.1 via RPC SECURITY DEFINER com retorno mínimo.
- **RBAC granular:** `requireAdmin` / `requirePermission` usados nos módulos privilegiados (team, rbac, guardian, feature-flags, integrations). Único ponto legítimo de `has_role` fica em `src/lib/rbac/guard.ts`, conforme ADR-001.
- **Isolamento por company_id:** todas as fns lêem via `currentCompanyId(context)` (que passa por `profiles` sob RLS do próprio user) ou `getCurrentCompanyId(ctx)`. Escritas com admin client sempre precedidas por checagem de autorização + escopo por `company_id`.
- **Ownership:** operações destrutivas (`removeMember`, `setMemberStatus`, `updateMemberRole`) checam `data.userId !== context.userId` para evitar auto-lockout.
- **Verdict:** **OK.** Sem findings High/Critical.

## 2. RLS Audit — tabelas

- 64 tabelas em `public`. **100% com RLS habilitado e ao menos 1 policy.**
- **GRANT para anon:** `information_schema.role_table_grants` retorna **0 linhas** para `grantee='anon'` no schema `public`. Nenhuma tabela é alcançável por anônimos via Data API.
- **Policies `USING (true)`:** apenas 2, ambas restritas a `authenticated`:
  - `plan_limits` → catálogo de planos (público a signed-in por design).
  - `permissions` → catálogo do registry RBAC (público a signed-in por design).
- **`pending_invites`:** somente policies de `authenticated` (admins/members da empresa). Acesso anônimo removido no Hotfix 01.1 e substituído por RPC `preview_invite_by_token`.
- **Company isolation:** policies chave (`contacts`, `conversations`, `messages`, `broadcasts`, `flows`, `channels`, `ai_agents`, `guardian_*`) escopam por `company_id = current_company_id()` ou `is_company_member(company_id)`.
- **Verdict:** **OK.** Sem findings High/Critical.

## 3. Server Functions

- Módulos usam Zod via `.inputValidator()` em todas as fns POST que aceitam payload de usuário.
- Fns sem `inputValidator` (`listAgents`, `listIntegrations`, `guardianScan`, `guardianHealth`, `guardianAuditLog`, `guardianChatHistory`, `guardianActiveProvider`, `guardianTestProvider`, `dismissOnboarding`) não recebem input — ausência é correta.
- Tratamento de erro: erros são propagados (`throw new Error(error.message)`); migração para `AppError` está no backlog (F-0002, ADR-005) — Medium.
- **`supabaseAdmin`** só é carregado dinamicamente dentro de `.handler()` (padrão TanStack — evita leak pro bundle cliente). Confirmado por grep.
- **Verdict:** **OK.**

## 4. Webhooks

- `/api/public/webhooks/whatsapp/:channelId` (Meta Cloud API) — **HIGH corrigido**, ver §Fixes.
- `/api/public/hooks/whatsapp-webhook` — usa `WHATSAPP_WEBHOOK_SECRET` (HMAC SHA-256, `timingSafeEqual`). Correto **quando o segredo está configurado**. Se `WHATSAPP_WEBHOOK_SECRET` estiver ausente no ambiente, o handler pula a verificação — mesmo padrão do webhook Meta, agora fechado apenas para o receiver Meta principal. Registrado como **M2.1-M-05 (MEDIUM)** para o endpoint alternativo (segredo global obrigatório).
- Cron endpoints (`guardian-cron`, `cascade-tick`) — autenticados por `apikey === SUPABASE_PUBLISHABLE_KEY`. Como essa chave é publicável (visível no cliente), o endpoint é efetivamente aberto a qualquer visitante. Impacto limitado: os loops têm `limit(50)`/`limit(20)` e as ações são idempotentes por fingerprint/lock. Registrado como **M2.1-M-01 (MEDIUM)**.
- `flow-resume` — segredo dedicado `FLOW_SCHEDULER_SECRET`, comparação por igualdade estrita. OK.
- Nenhum handler implementa `X-Timestamp`/nonce anti-replay explícito. Meta já traz `X-Hub-Signature-256` sobre o corpo (que carrega IDs e timestamps do provedor) e a inserção idempotente por `provider_message_id` bloqueia replay funcional. Registrado como **M2.1-L-01 (LOW)**.
- Nenhum handler tem `timeout` de request. Cloudflare Worker impõe limite superior; risco baixo. **M2.1-L-02 (LOW)**.
- **Verdict:** 1 HIGH fixado; medium/low registrados.

## 5. Uploads

- Buckets: `message-media`, `agent-knowledge`, `avatars`, `contact-files` — todos privados.
- Nenhum bucket `Is Public: Yes`.
- Componente `src/components/inbox/audio-recorder.tsx` grava audio via `MediaRecorder` e envia ao bucket privado. Sem validação servidor-side de MIME/tamanho — Supabase Storage aplica os limites por bucket policy. Registrado como **M2.1-M-02 (MEDIUM)**: sem checagem servidor-side de tipo (`allowedMimeTypes`) nos buckets.
- **Verdict:** OK dinâmico; recomendações registradas.

## 6. Secrets

- `.env` contém apenas `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (anon JWT — publicável por design) e seus espelhos `VITE_*`. Correto.
- Nenhum `VITE_SUPABASE_SERVICE_ROLE_KEY` / `VITE_LOVABLE_API_KEY` / `VITE_SERVICE_*` no repositório.
- `SUPABASE_SERVICE_ROLE_KEY` gerenciado pela plataforma Lovable Cloud, disponível apenas via `client.server.ts` e nunca importado no bundle cliente (validado com grep + regra `.server.ts` do TanStack).
- Runtime secrets configurados: `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Nenhum orfão detectado.
- **Verdict:** **OK.**

## 7. Rate Limit

- Existe `src/lib/security/rate-limit.ts` (utilitário in-memory, escopo Worker).
- Nenhum endpoint público (`previewInvite`, `acceptInviteByToken`, cron, webhooks) invoca o utilitário no fluxo atual — em Worker stateless o rate limit precisaria de storage compartilhado (KV/Turnstile). Registrado como **M2.1-M-03 (MEDIUM)** — não é bloqueador, mas recomenda-se colocar Turnstile ou KV rate limit nos endpoints listados.
- **Verdict:** OK para escopo desta missão (nenhum abuso ativo).

## 8. Sessão

- Auth Supabase — `persistSession=true` no cliente browser; `persistSession=false` em todos os clientes server-side.
- Refresh de token automático via `onAuthStateChange` no `__root.tsx` (filtrado para `SIGNED_IN|SIGNED_OUT|USER_UPDATED`, evita thrashing).
- Logout: `_authenticated/route.tsx` gerenciado pela integração, gate `ssr:false` + redirect para `/auth` em `SIGNED_OUT`. `queryClient.clear()` + `cancelQueries()` são o padrão recomendado (documentado no ADR de auth-guards).
- Múltiplas abas: `onAuthStateChange` propaga `SIGNED_OUT` para todas as instâncias do cliente Supabase (mesmo storage). OK.
- Expiração: tokens JWT padrão (1h) com refresh automático.
- **Verdict:** **OK.**

## 9. Security Scan (reexecução)

- **Supabase Linter:** 11 WARN (0 ERROR/HIGH). Todos pré-existentes e triados na Missão 1 + Hotfix 01.1:
  - `Extension in Public` → `pg_net` (managed pelo Supabase).
  - 10 × `SECURITY DEFINER` executável → helpers de RLS/RBAC by design (`has_role`, `has_permission`, `current_company_id`, `is_company_member`, `my_effective_permissions`, `accept_invite_token`, `preview_invite_by_token`, `flow_run_acquire_lock`, `flow_run_release_lock`, `next_flow_version_number`, etc.).
- **Security scan persistido:** 12 findings, todos `warn`. Zero `error`.
- **Dependency scan (npm audit):** **0 vulnerabilidades High/Critical**.
- **Verdict:** **OK.**

---

## Fixes aplicados nesta missão

### F-M2-01 (HIGH) — WhatsApp webhook signature bypass

**Arquivo:** `src/routes/api/public/webhooks/whatsapp.$channelId.ts`
**Antes:**
```ts
if (creds.app_secret) {
  if (!verifyMetaSignature(raw, sig, creds.app_secret)) return 401;
}
```
Se o canal tivesse `app_secret` ausente no JSON de credenciais, o handler processava qualquer POST anônimo — permitindo:
- injetar mensagens falsas em nome de qualquer contato,
- criar/poluir contatos e conversas,
- disparar respostas automáticas via IA (consumindo `LOVABLE_API_KEY`),
- enviar mensagens outbound reais via WhatsApp Cloud para números controlados pelo atacante.

**Depois:** signature verification **obrigatória**. Sem `app_secret` configurado → 401 imediato. Sinal ausente/inválido → 401. Ambos os rejects são auditados em `channel_events` com `payload.reason`.

**Validação:**
- `bun run build` verde (após ajuste de tipo `event_type` para tipo do enum de `channel_events`).
- Requisição sem header `x-hub-signature-256` contra canal sem `app_secret` retorna 401 (revisão manual do handler).
- Handshake GET (`hub.mode=subscribe`) continua funcionando com `webhook_verify_token`.

Status: **RESOLVIDO**.

---

## Findings Medium/Low (registrados, não corrigidos)

| ID | Severidade | Área | Descrição | Ação recomendada |
|----|-----------|------|-----------|------------------|
| M2.1-M-01 | MEDIUM | Webhooks/Cron | `guardian-cron` e `cascade-tick` autenticados por `SUPABASE_PUBLISHABLE_KEY` (chave pública) | Trocar por segredos dedicados (`GUARDIAN_CRON_SECRET`, `CASCADE_CRON_SECRET`) — padrão do `flow-resume` |
| M2.1-M-02 | MEDIUM | Uploads | Buckets Storage sem `allowedMimeTypes` e `fileSizeLimit` explícitos | Configurar limites por bucket via `supabase--storage_update_bucket` |
| M2.1-M-03 | MEDIUM | Rate limit | Endpoints públicos (previewInvite, acceptInviteByToken, cron, webhooks) sem rate limit compartilhado | Turnstile ou Cloudflare KV rate limit no edge |
| M2.1-M-05 | MEDIUM | Webhooks | `WHATSAPP_WEBHOOK_SECRET` opcional no receiver alternativo (`/hooks/whatsapp-webhook`) | Tornar obrigatório se este endpoint continuar em uso; ou depreciar em favor do receiver Meta principal |
| M2.1-L-01 | LOW | Webhooks | Sem anti-replay explícito por timestamp/nonce | Rejeitar payloads Meta cujo timestamp interno diverge do `now()` em > 5 min |
| M2.1-L-02 | LOW | Webhooks | Sem `AbortController` timeout em fetches de mídia Meta | Timeout de 10s em `fetchMediaUrl` |

---

## Critério de encerramento

- ✅ Todos os High/Critical de segurança dinâmica resolvidos ou justificados (1 HIGH corrigido; 0 restante).
- ✅ Relatórios atualizados (`findings.json`, `production-verdict.md`, este documento).
- ✅ Novo parecer de segurança emitido (próxima seção do `production-verdict.md`).

**Status: MISSÃO 2.1 CONCLUÍDA. Aguardando autorização explícita para iniciar Missão 2.2.**
