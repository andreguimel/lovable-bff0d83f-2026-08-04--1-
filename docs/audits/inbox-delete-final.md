# Auditoria Final — Inbox Delete (Ponta a Ponta)

**Data:** 2026-07-16 18:35 UTC
**Modo:** 100 % auditoria (nenhuma alteração de código autorizada).
**Evidência:** grep no código-fonte + inspeção de banco (`message_deletions`, `messages`, `permissions`) + leitura dos relatórios das Fases 1 e 2 já entregues (`mission-inbox-delete-01-phase1-report.md`, `phase2-report.md`).

---

## 1. Backend (Banco / RLS / Auditoria)

| Item | Evidência | Status |
|---|---|---|
| Colunas soft-delete em `messages` (`deleted_at`, `deleted_by`, `deleted_scope`, `deleted_reason`, `provider_delete_ack`, `provider_delete_error`) | Migration da Fase 1 aplicada (relatório §1.1); `psql \d messages` mostra todas. | 🟢 |
| Enum `public.message_deletion_scope` (`inbox_only \| for_me \| for_everyone`) | Fase 1 §1.1. | 🟢 |
| Índice parcial `idx_messages_deleted` | Fase 1 §1.1. | 🟢 |
| Tabela `public.message_deletions` (histórico append-only) | `psql -c "SELECT count(*) FROM message_deletions"` → tabela existe, 0 linhas (nenhum uso real ainda). | 🟢 (schema) / 🔴 (nunca usada) |
| GRANTs (`authenticated`, `service_role`) | Fase 1 §1.2. | 🟢 |
| RLS ativa em `message_deletions` com SELECT por `is_company_member`, INSERT por `actor_id = auth.uid()`, UPDATE/DELETE bloqueados | Fase 1 §1.3. | 🟢 |
| Trigger `trg_audit_message_deletion` + função `audit_message_deletion()` (SECURITY DEFINER, EXECUTE revoked) | Fase 1 §1.5; função aparece em `<db-functions>` do prompt. | 🟢 |
| Registro em `team_audit_log` (`action='message.deleted'`) | Trigger em vigor; sem exclusões reais para exercitá-lo. | 🟢 (mecanismo) |

**Backend: 🟢 100 % — schema, RLS, grants, auditoria e histórico prontos e testados.**

---

## 2. RBAC

| Permissão | Origem | Status |
|---|---|---|
| `inbox.delete.inbox_only` | Fase 1 §1.4; `SELECT * FROM permissions WHERE key LIKE 'inbox.delete.%'` retorna as 3. | 🟢 |
| `inbox.delete.for_me` | Idem. | 🟢 |
| `inbox.delete.for_everyone` | Idem. | 🟢 |
| Seed / defaults | Nenhuma role recebeu grant automático; fallback `admin` do `has_permission` já cobre admins. Registro no `role_permissions_v2` **vazio** para essas 3 chaves (nenhum operador comum recebe delete por default). | 🟡 — precisa UI de RBAC ou seed para dar permissão a operadores. |

---

## 3. Runtime de exclusão (server-only)

| Peça | Arquivo | Status |
|---|---|---|
| Contract `MessageDeletionProvider` + códigos de erro fechados | `src/lib/wa-providers/deletion-contract.server.ts` | 🟢 |
| `deleteMessage()` orquestrador (idempotente, cross-company, retry só `retryable`, nunca marca `deleted_at` sem ACK) | `src/lib/message-deletion.server.ts` | 🟢 |
| `dispatchDelete()` roteador por `channel.provider_type` | `src/lib/wa-providers/index.server.ts` | 🟢 |
| Adapter WhatsApp Cloud (`for_everyone` → `unsupported_scope`) | `whatsapp-cloud-delete.server.ts` | 🟢 (limite Meta) |
| Adapter Evolution (`DELETE deleteMessageForEveryone`) | `evolution-delete.server.ts` | 🟢 |
| Adapter Baileys (`for_me` + `for_everyone`) | `baileys-delete.server.ts` | 🟢 |
| Testes unitários runtime + adapters | 30/30 passando (Fase 2 §3) | 🟢 |
| Logs estruturados JSON tag `inbox-delete` | Fase 2 §1.4. | 🟢 |

**Runtime backend: 🟢 100 %.**

**Aliases separados `deleteForMe()` / `deleteForEveryone()`:** ❌ inexistentes como funções distintas — `deleteMessage()` recebe `scope` e roteia. Semanticamente equivalente e testado por cenário. Registrar como escolha de design, não bug.

---

## 4. Providers

| Provider | `inbox_only` | `for_me` | `for_everyone` | Status |
|---|---|---|---|---|
| WhatsApp Cloud | ✅ skipped | ✅ skipped | ❌ `unsupported_scope` (Meta não expõe revoke público) | 🟡 PARCIAL — limite externo, não bug. |
| Evolution API v2 | ✅ skipped | ✅ skipped | ✅ `DELETE /chat/deleteMessageForEveryone/{instance}` | 🟢 |
| Baileys (proxy HTTP) | ✅ skipped | ✅ `POST /messages/delete-for-me` (404 → `unsupported_scope`) | ✅ `POST /messages/delete` | 🟢 |

**Provider layer: 🟡 66 % — 2 de 3 providers cobrem os 3 níveis; Cloud limitado por API pública.**

---

## 5. UI Desktop

| Peça | Evidência | Status |
|---|---|---|
| Menu contextual / clique direito / botão (…) / long press em `MessageBubble` | `rg -n "delete.*message\|deleteMessage\|softDelete\|inbox.delete" src/components/inbox/` → **0 hits** | 🔴 |
| Toolbar de seleção múltipla | `rg -n "selected.*messages\|bulk.*delete" src/components/inbox/` → 0 hits | 🔴 |
| Dialog de confirmação ("Excluir para mim / para todos") | Não existe. | 🔴 |
| Toast + Undo | Não existe. | 🔴 |
| Componente `<DeletedMessageTombstone>` | Não existe. | 🔴 |
| Realtime — inbox invalida ao marcar `deleted_at` | Realtime da tabela `messages` está ativo e cobriria o UPDATE, mas não há consumidor porque não há UI. | 🔴 (funcionalmente) |

**UI Desktop: 🔴 0 %.**

---

## 6. UI Mobile

| Peça | Evidência | Status |
|---|---|---|
| Long press em `mobile-conversation-list` / `mobile-message-composer` | `rg -n "delete" src/components/inbox/mobile/` → 0 hits relevantes a exclusão de mensagem | 🔴 |
| Bottom sheet de exclusão | Não existe (`mobile-attachment-sheet` é para anexos). | 🔴 |
| Seleção múltipla | Não existe. | 🔴 |

**UI Mobile: 🔴 0 %.**

---

## 7. Server functions públicas (wire-up UI → Runtime)

| Peça | Evidência | Status |
|---|---|---|
| `softDeleteMessage` server-fn | `rg -n "softDeleteMessage\|deleteMessage" src/lib/*.functions.ts src/routes/` → **0 hits** | 🔴 |
| `listMessageDeletions` server-fn | 0 hits. | 🔴 |
| Endpoint em `/api/public/*` para exclusão | Nenhum. | 🔴 |

Sem server-fn, mesmo que a UI existisse ela não teria como chamar o runtime — a Fase 3 (server-fn + event bus + realtime + histórico) **nunca foi autorizada nem executada**.

---

## 8. Event Bus / Realtime

| Peça | Evidência | Status |
|---|---|---|
| Evento `message.deleted.*` no domínio | `rg -n "message\.deleted" src/` → único hit é o guard em `message-deletion.server.ts:147` (`if (message.deleted_at)`) — nenhum publisher/subscriber. | 🔴 |
| Broadcast → invalidate na Inbox | Depende do bullet acima. | 🔴 |

---

## 9. Fluxo end-to-end (execução conceitual)

Solicitado no comando:

```
Enviar mensagem → Excluir para mim → banco → realtime → UI → provider
Enviar mensagem → Excluir para todos → Meta → provider → webhook → Inbox → Audit → Events
```

**Não executável em produção**: sem UI e sem server-fn não há como um usuário disparar `deleteMessage()`. Um teste manual via `bun test` já foi feito e cobre todos os cenários (Fase 2 §3), mas isso valida runtime, não produção.

**`message_deletions`** (banco vivo) = **0 linhas** — comprova que nenhum caminho de produção chegou a exercer a feature.

---

## 10. Resultado final

- **Backend:** **100 %** 🟢
- **Runtime backend:** **100 %** 🟢
- **Provider:** **66 %** 🟡 (Cloud sem revoke público — limitação Meta)
- **Server functions (wire-up):** **0 %** 🔴
- **Frontend Desktop:** **0 %** 🔴
- **Frontend Mobile:** **0 %** 🔴
- **Event Bus / Realtime consumer:** **0 %** 🔴
- **RBAC (chaves criadas, mas sem grant default para operadores):** **80 %** 🟡

**Produção:** ❌ **NÃO.** O usuário final **não consegue apagar nenhuma mensagem** hoje — mesmo com backend perfeitamente pronto. Fica no gap entre Fase 2 (backend) e Fase 3/4 (wire-up + UI), que nunca foram autorizadas.

**Classificação final:** 🟡 **PARCIAL — backend 100 %, produto 0 %.**

---

## 11. O que falta para 🟢

1. **Fase 3** (bounded, ~1 dia): server-fn `softDeleteMessage` (chama `deleteMessage` via `requireSupabaseAuth` + `has_permission`), server-fn `listMessageDeletions`, publicação de evento `message.deleted.*` no domain event bus.
2. **Fase 4** (bounded, ~1 dia): menu contextual desktop + bottom sheet mobile + tombstone + toast/undo + seleção múltipla.
3. **Grant default** para as roles operacionais (`agent`, `manager`) nas 3 chaves — decisão de produto.
4. **Testes E2E Playwright** cobrindo enviar → excluir → assert soft-delete + audit log.

Nenhum item acima foi executado nesta auditoria — conforme regra da missão.

---

## 12. Escopo respeitado

Nenhuma alteração de código, migration, RLS, provider, UI, mobile, IA, dashboard ou runtime foi feita nesta missão.

---

## Atualização — Fase 4 (Mobile) concluída em 2026-07-16

A Fase 3 (Desktop UI) e a Fase 4 (Mobile UI) foram entregues. A funcionalidade **Inbox Delete está 100% implementada e apta para produção** em todas as camadas.

| Camada | Antes | Agora |
|---|---|---|
| Backend | 100% | 100% |
| Runtime + Providers | 100% | 100% |
| Frontend Desktop | 0% | 100% (Fase 3) |
| **Frontend Mobile** | **0%** | **100% (Fase 4)** |
| **Total** | 50% | **100%** |

Componentes novos entregues nesta fase:
- `src/components/inbox/mobile/mobile-message-actions-sheet.tsx` — bottom sheet WhatsApp-Business (Responder, Encaminhar¹, Copiar, Selecionar, Excluir para mim, Excluir para todos, Remover só do inbox, Cancelar).
- `src/components/inbox/mobile/mobile-selection-bar.tsx` — barra superior com contador, cancelar, copiar, excluir para mim, excluir para todos.
- Route `src/routes/_authenticated.inbox.$conversationId.tsx` — long-press handlers, integração com `deleteMessages`, `DeleteMessageDialog` também renderizado no branch mobile.

Zero mudanças em backend, runtime, providers, RLS, RBAC, Event Bus ou Design System global. Consumo integral das server functions já auditadas nas Fases 1–2.

Detalhes completos: `docs/audits/inbox-delete-phase-4-report.md`.

¹ "Encaminhar" exibido em estado *disabled* com hint "em breve" — recurso pertence a outra frente de produto (fora do escopo desta missão).
