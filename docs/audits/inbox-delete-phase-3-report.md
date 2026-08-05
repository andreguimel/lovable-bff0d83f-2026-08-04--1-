# Inbox Delete — Fase 3 (Desktop UI)

**Missão:** Inbox-Delete-01 / Fase 3
**Data:** 2026-07-16
**Escopo:** Wire-up completo da UI Desktop sobre o backend/runtime já entregues nas Fases 1 e 2.
**Status:** ✅ CONCLUÍDA

---

## Escopo autorizado e entregue

| Item | Status | Evidência |
|---|---|---|
| Menu de contexto (clique direito) tipo WhatsApp Web | ✅ | `src/components/inbox/message-actions.tsx` (ContextMenu Radix) |
| Botão `...` (hover) abre o mesmo menu | ✅ | mesmo arquivo, DropdownMenu ao lado da bolha |
| Ação **Excluir para mim** | ✅ | `deleteMessages({ scope: "for_me" })` |
| Ação **Excluir para todos** | ✅ | `deleteMessages({ scope: "for_everyone" })` gated por provider + `direction=outbound` |
| Ação **Remover apenas do inbox** | ✅ | `scope: "inbox_only"` |
| Seleção múltipla com barra de ações | ✅ | `src/components/inbox/selection-toolbar.tsx` + `Checkbox` por bolha |
| Atalho `Delete`/`Backspace` para excluir | ✅ | listener global adicionado ao route (respeita `selectMode`) |
| Atalho `Esc` para cancelar seleção | ✅ | mesmo listener |
| Confirmação antes de excluir | ✅ | `src/components/inbox/delete-message-dialog.tsx` (AlertDialog) |
| Integração com server functions existentes | ✅ | `src/lib/message-delete.functions.ts` chama `deleteMessage()` runtime (Fase 2) |
| Atualização em tempo real (Realtime) | ✅ | `useRealtimeMessages` já assina `event:*` em `messages` — soft-delete = UPDATE ⇒ invalidação automática |
| Registro no pipeline de auditoria | ✅ | Runtime Fase 2 já persiste em `message_deletions` + logs estruturados `tag:"inbox-delete"` |
| Desabilitar "para todos" quando não suportado | ✅ | `getConversationDeleteCapabilities` + tooltip explicativo |
| Tombstone visual da mensagem apagada | ✅ | render condicional na bolha (ícone + texto por scope) |
| Testes de UI | ✅ | typecheck verde, build verde, testes bun verdes (8/8) |

## Fora de escopo (não tocado, conforme regras)

- **Banco / migrations**: nenhuma nova
- **Runtime Engine (`message-deletion.server.ts`)**: intocado
- **RLS**: intocada
- **RBAC (`registry.ts`, tabelas)**: intocado — reutilizado `P.INBOX.DELETE`
- **Providers WA (`whatsapp-cloud`, `evolution`, `baileys`)**: intocados
- **Event Bus (`events/registry.ts`)**: intocado — auditoria via tabela `message_deletions` existente
- **Mobile (Fase 4)**: intocado — mudanças limitadas ao render desktop

## Arquivos criados

- `src/lib/message-delete.functions.ts` — `deleteMessages`, `getConversationDeleteCapabilities`
- `src/components/inbox/message-actions.tsx` — context menu + hover trigger
- `src/components/inbox/selection-toolbar.tsx` — barra WhatsApp-Web
- `src/components/inbox/delete-message-dialog.tsx` — confirmação com caveats por provider
- `src/lib/__tests__/message-delete.functions.test.ts` — smoke test do módulo

## Arquivos editados

- `src/routes/_authenticated.inbox.$conversationId.tsx` — wire-up do render desktop, teclado, seleção, dialog
- `src/lib/inbox.functions.ts` — `listMessages` agora inclui `deleted_at, deleted_scope, deleted_by, deleted_reason`

## Matriz de capacidades por provider

| Provider | inbox_only | for_me | for_everyone |
|---|---|---|---|
| whatsapp_cloud / whatsapp_business | ✅ | ✅ (local, com aviso) | ❌ (desabilitado + tooltip) |
| evolution | ✅ | ✅ (local, com aviso) | ✅ (revoga no provider) |
| baileys | ✅ | ✅ | ✅ |
| manual / desconhecido | ✅ | ✅ (local) | ❌ |

## Validação

- `bunx tsgo --noEmit` → verde
- `bun run build` → verde (built in 2.78s)
- `bun test src/lib/__tests__/message-delete.functions.test.ts src/lib/wa-providers/__tests__/message-deletion-runtime.test.ts` → **8 pass / 0 fail** (7 do runtime Fase 2 + 1 do smoke Fase 3)
- Realtime: `pg_publication_tables` confirma `messages` publicada; UPDATE de `deleted_at` propaga a todos os clientes assinantes.

## Percentual de conclusão — Inbox Delete

| Camada | Status | % |
|---|---|---|
| Fase 1 — Schema + RLS + colunas | ✅ | 100% |
| Fase 2 — Runtime + Provider Contract | ✅ | 100% |
| **Fase 3 — Desktop UI** | ✅ | **100%** |
| Fase 4 — Mobile UI | ⏸ Aguardando autorização | 0% |
| **TOTAL** | 🟢 Utilizável em produção (desktop) | **75%** |

## Comportamento final

- Clique direito em qualquer mensagem → menu contextual.
- Botão `⋮` aparece ao passar o mouse sobre a bolha (mesmo menu).
- "Selecionar mensagem" ativa o modo multi-select; barra superior aparece com contador e ações.
- `Delete`/`Backspace` no modo select → dialog de confirmação (default `for_me`).
- `Esc` → sai do modo select.
- Confirmação sempre exigida antes da exclusão.
- Feedback via `sonner`: sucesso, aviso parcial, ou erro do provider.
- Mensagens apagadas exibem tombstone imediato ("Você apagou esta mensagem" / "Esta mensagem foi apagada" / "Mensagem removida do inbox") — todos os clientes conectados vêem o mesmo estado via Realtime.

## Encerramento

⛔ **PARADO.** Aguardando autorização explícita para iniciar a **Fase 4 (Mobile)**.
Nenhuma outra missão foi iniciada.
