# SECURITY.md

## Estado atual

- **RLS ativo em 100% das tabelas `public`** (69/69).
- **68/69 tabelas** com policies explícitas (`scheduler_heartbeats` intencionalmente só via `service_role`).
- **GRANT** aplicado em todas as tabelas (auditado nas 54 migrations).
- **Multi-tenancy** enforçado por `company_id` + `is_company_member()` + `current_company_id()`.
- **Roles**: enum `app_role` (`admin`, `moderator`, `user`) em tabela dedicada `user_roles` (padrão anti-escalada).
- **RBAC granular**: `permissions` (45 registros) + `role_permissions_v2` + `member_permission_overrides`, resolvido por `has_permission()`.
- **Auth**: Supabase gerenciado, senha + Google + convites por token.
- **Convites**: `pending_invites` com token, TTL, `preview_invite_by_token` (SECURITY DEFINER) para preview sem login, `accept_invite_token` para aceite pós-login.
- **Auditoria**: `team_audit_log` alimentado por triggers (`audit_enrichment_suggestion_change`, `audit_message_deletion`, `accept_invite_token`, etc.).
- **Secrets**: 6 secrets registrados (nada exposto no bundle client).

## Pontos fortes

- **`has_role`** compara `auth.uid() = _user_id` **antes** de checar a tabela — impede consulta de role de terceiros.
- **`has_permission`** tem cascata segura (override > role > admin default false) — sem privilege escalation por default.
- **Todas as functions SECURITY DEFINER** têm `SET search_path = public` — impede hijack via schema search path.
- **`handle_new_user`** trata convite + fallback solo sem race — cria company + role + tags padrão atomicamente.
- **Storage buckets**: 4/4 privados (`message-media`, `agent-knowledge`, `avatars`, `contact-files`). Nenhum bucket público exposto.
- **Webhook WhatsApp** verifica assinatura HMAC (revisado em auditoria de channels).
- **Auth attacher** (`attachSupabaseAuth`) centraliza bearer token em todas as server functions.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| SEC-H-01 | **High** | `public.exec_read_sql` (SECURITY DEFINER, EXECUTE para `authenticated`) usa parser textual bypassável (comentários SQL, aspas escapadas). Poderia levar a leitura de dados de outras companies. Backlog `R2-L-12` (elevar para High). |
| SEC-H-02 | **High** | 12 funções SECURITY DEFINER com EXECUTE amplo (`master-audit/backlog.md#F-0004`) — revisar necessidade de cada grant. |
| SEC-H-03 | **High** | Password HIBP Check status não confirmado nesta auditoria — verificar `configure_auth` em Cloud → Users → Auth Settings. Se OFF, ligar antes do piloto público. |
| SEC-M-04 | Medium | Extensões em `public` (`F-0005`) — vetor de exposição menor, mas convenção recomenda schema `extensions`. |
| SEC-M-05 | Medium | Faltam testes automatizados de RLS (pen tests unitários por company/role). Existem em `src/lib/__tests__/` mas cobertura parcial. |
| SEC-L-06 | Low | Rotação de `LOVABLE_API_KEY` e `FLOW_SCHEDULER_SECRET` não tem cadência documentada. |

## Evidências

- `SELECT count(*) FROM pg_policies WHERE schemaname='public'` → 78 policies em 68 tabelas.
- Funções DEFINER auditadas: `has_role`, `has_permission`, `is_company_member`, `current_company_id`, `handle_new_user`, `preview_invite_by_token`, `accept_invite_token`, `create_default_subscription`, `flow_run_acquire_lock`, `flow_run_release_lock`, `audit_*`, `exec_read_sql`, `my_effective_permissions`.
- Secrets registrados (nomes apenas): `SUPABASE_*` (3), `FLOW_SCHEDULER_SECRET`, `LOVABLE_API_KEY`.
- Buckets: `SELECT bucket_id, count(*) FROM storage.objects` → apenas `message-media` com 7 objetos.

## Recomendações (backlog)

- **SEC-H-01** → **antes do piloto público**: substituir `exec_read_sql` por whitelisting de queries nomeadas (server function autenticada com Zod).
- **SEC-H-02** → auditar EXECUTE grants; revogar de `anon` onde possível.
- **SEC-H-03** → ligar HIBP no dashboard Cloud → Users → Auth Settings.
- **SEC-M-04/05** → pós-piloto.
- **SEC-L-06** → documentar rotação semestral no `OPERATIONS.md`.

**Recomendação Fase 1:** segurança **sólida** para piloto controlado (WebMarcas). Antes de abrir a mais tenants, tratar **SEC-H-01** e **SEC-H-03** como sub-missões.
