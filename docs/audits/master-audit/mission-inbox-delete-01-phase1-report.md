# Missão Inbox-Delete-01 — Fase 1 (Banco, RLS, RBAC, Auditoria)

**Status:** ✅ Concluída — aguardando autorização para Fase 2  
**Data:** 2026-07-16  
**Escopo autorizado:** descongelamento parcial exclusivo para a funcionalidade de exclusão de mensagens (3 níveis, soft-delete).  
**Regra global reafirmada:** ao final da missão o congelamento arquitetural volta a valer automaticamente.

---

## 1. Entregas desta fase

### 1.1 Schema

**`public.messages` — soft-delete não destrutivo**

Novas colunas (todas nullable, sem default destrutivo, sem CHECK time-dependent):

| Coluna | Tipo | Uso |
|---|---|---|
| `deleted_at` | `timestamptz` | Marca temporal da exclusão. `NULL` = mensagem viva. |
| `deleted_by` | `uuid → auth.users` | Ator humano que solicitou a exclusão. |
| `deleted_scope` | `public.message_deletion_scope` | Nível efetivo aplicado. |
| `deleted_reason` | `text` | Motivo opcional (auditoria/compliance). |
| `provider_delete_ack` | `boolean` | Confirmação do provedor (usado na Fase 2). |
| `provider_delete_error` | `text` | Erro retornado pelo provedor. |

Enum criado:

```
public.message_deletion_scope = { inbox_only | for_me | for_everyone }
```

Índice parcial:

```
idx_messages_deleted ON (conversation_id, deleted_at DESC) WHERE deleted_at IS NOT NULL
```

**Preservação de integridade:**  
- Nenhum registro é removido fisicamente.  
- `provider_message_id`, `body`, `media_url`, `media_metadata`, `reply_to_id` permanecem intactos.  
- Constraints e FKs de `messages` não foram alteradas.  
- Publicação `supabase_realtime` inalterada.

### 1.2 Nova tabela — `public.message_deletions`

Histórico completo de tentativas de exclusão (append-only pelo lado do cliente):

| Campo | Tipo |
|---|---|
| `company_id` | uuid → companies |
| `message_id` | uuid → messages |
| `conversation_id` | uuid → conversations |
| `actor_id` | uuid → auth.users |
| `scope` | message_deletion_scope |
| `reason` | text |
| `provider_ack` | boolean |
| `provider_error` | text |
| `provider_response` | jsonb |

Índices: `(company_id, created_at DESC)`, `(message_id)`, `(conversation_id, created_at DESC)`.

**Grants aplicados na mesma migration** (conforme regra `public-schema-grants`):

```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_deletions TO authenticated;
GRANT ALL ON public.message_deletions TO service_role;
```

### 1.3 RLS

- `message_deletions` com RLS habilitada.  
- **SELECT**: `is_company_member(company_id)`.  
- **INSERT**: `is_company_member(company_id) AND actor_id = auth.uid()` — impede forjar autor.  
- **UPDATE/DELETE**: bloqueados para `authenticated`; apenas `service_role` (histórico imutável).  
- `messages`: política existente `Members manage messages` já cobre a marcação de `deleted_at` via UPDATE isolado por `company_id`. Nenhuma política existente foi modificada.

### 1.4 RBAC

Três novas permissões granulares em `public.permissions`:

| Chave | Ação semântica |
|---|---|
| `inbox.delete.inbox_only` | Oculta somente na Zenda. Não fala com o provedor. |
| `inbox.delete.for_me` | Remove no lado da empresa (local WhatsApp); mantém no cliente. |
| `inbox.delete.for_everyone` | Aciona revoke no provedor (impacta o cliente). |

A chave antiga `inbox.delete` foi preservada como agrupador legado; o mapeamento `role_permissions_v2` existente continua válido. Nenhuma role recebeu grant automático — a atribuição virá via UI de RBAC (fora do escopo desta fase) ou pela lógica de fallback `admin` já embutida em `has_permission`.

### 1.5 Auditoria

Trigger `trg_audit_message_deletion` (AFTER UPDATE OF `deleted_at` em `messages`):

- Insere em `team_audit_log` com `action='message.deleted'`, `entity='message'`, `entity_id=<message.id>` e `diff` contendo `scope`, `reason`, `conversation_id`, `provider_message_id`, `provider_ack`, `provider_error`.  
- Função `public.audit_message_deletion()` é `SECURITY DEFINER` com `search_path=public` e **`EXECUTE` revogado** de `PUBLIC`, `anon` e `authenticated` (só service_role e o próprio trigger a invocam).

---

## 2. Verificações

| Item | Resultado |
|---|---|
| Migration aplicada | ✅ |
| Trigger criado | ✅ (`trg_audit_message_deletion`) |
| GRANTs em tabela nova | ✅ (`authenticated` + `service_role`) |
| RLS habilitada em `message_deletions` | ✅ |
| Policies isolando por `company_id` | ✅ |
| Security Linter | 13 → **11** warnings (as 2 novas geradas pela função de auditoria foram sanadas via `REVOKE EXECUTE`). Os 11 remanescentes são **pré-existentes** ao Gate de Consolidação e **não pertencem** ao escopo desta missão. |
| Alterações fora do escopo | ❌ Nenhuma |

---

## 3. Escopo respeitado

| Área congelada | Tocada? |
|---|---|
| Runtime Engine | ❌ |
| Flow Engine | ❌ |
| Inbox Engine (código) | ❌ |
| Server Functions | ❌ (Fase 3) |
| Providers | ❌ (Fase 2) |
| Event Bus | ❌ (Fase 3) |
| UI Desktop / Mobile | ❌ (Fase 4) |
| Design System | ❌ |
| Módulos não relacionados | ❌ |

Apenas o schema estritamente necessário para as fases subsequentes foi criado.

---

## 4. Backlog gerado por esta fase

Nenhum novo requisito descoberto que exija abertura de missão paralela. Warnings de linter pré-existentes (11) permanecem no backlog geral e não bloqueiam a Fase 2.

---

## 5. Próximo passo (aguardando autorização)

**Fase 2 — Provider Contract + Runtime**  
- Definir `MessageDeletionProvider` (WhatsApp Cloud, Evolution, Baileys).  
- Integrar dispatch de revoke no runtime.  
- Testes do runtime.  
- Relatório `mission-inbox-delete-01-phase2-report.md`.

> ⛔ **PARADO.** Aguardando autorização explícita para iniciar a Fase 2.
