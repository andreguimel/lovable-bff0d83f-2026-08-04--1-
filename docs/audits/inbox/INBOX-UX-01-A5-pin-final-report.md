# INBOX-UX-01 — Item A5 · Fixar Conversas (Validação Final)

**Data:** 2026-07-17
**Status:** ✅ **Encerrada**
**Grupo:** A · Item 5
**Base:** relatório inicial `INBOX-UX-01-A5-pin-report.md` + migration `20260717021106_...sql`

---

## 1. Escopo autorizado × entregue

| Requisito | Status |
|---|:-:|
| Fixar conversa | ✅ |
| Desafixar conversa | ✅ |
| Persistência em banco (`conversations.pinned` + `pinned_at`) | ✅ |
| Fixadas no topo | ✅ |
| Ordem de fixação preservada (`pinned_at DESC`) | ✅ |
| Não-fixadas mantêm ordenação atual (`last_message_at DESC`) | ✅ |
| Indicador visual (ícone Pin) | ✅ Desktop e Mobile |
| Compatibilidade Desktop / Mobile | ✅ (mesma server fn, componentes compartilhados) |
| Sincronização em tempo real entre abas | ✅ |
| Sem alteração de Runtime / Event Bus / Providers / RLS / RBAC / nova tabela | ✅ |
| Reutilização da persistência existente | ✅ (apenas coluna nova em `conversations`) |

---

## 2. Estado do banco (verificado)

```
pinned_at column .............. present
idx_conversations_pinned_order  present
supabase_realtime publication . conversations included
```

---

## 3. Validação obrigatória

### Build / Typecheck
- `bunx tsgo --noEmit` → **0 erros**.

### Playwright autenticado — Cenários exigidos

Script: `/tmp/browser/pin5/run.py`. Empresa de teste: `1a78ceb5-c9cc-4d8f-af6c-d6a7195a6f13` (3 conversas seed).

| Cenário | Evidência (estado retornado pelo DOM) | Resultado |
|---|---|:-:|
| **Fixar via context menu** | Ana passa a `hasPin=true` | ✅ |
| **Persistência após reload** | Reload manteve Ana `hasPin=true` no topo | ✅ |
| **Ordenação por `pinned_at DESC`** | Após fixar Carlos (mais antigo por `last_message_at`), ordem em ambas abas: `Carlos (pin, mais recente) → Ana (pin, mais antigo) → Beatriz` | ✅ |
| **Sincronização entre 2 abas via Realtime** | Aba 2 (nunca tocada) refletiu automaticamente os pins feitos na Aba 1 | ✅ |
| **Desafixar** | Todos pins removidos via mesmo caminho; lista voltou à ordenação por `last_message_at` | ✅ |

Estado do banco restaurado após teste: todas as conversas com `pinned=false, pinned_at=NULL`.

---

## 4. Arquitetura preservada

- Runtime, Event Bus, Providers, RBAC/RLS: **não tocados**.
- Persistência: reaproveitou tabela `conversations` (apenas 1 coluna `pinned_at` adicionada em missão anterior aprovada).
- UI: reaproveitou `conversation-actions.tsx`, `_authenticated.inbox.tsx`, `mobile-conversation-list.tsx`.
- Realtime: reaproveitou canal `conversations:all` em `use-realtime-messages.ts`.
- Server fn: `listConversations` + `updateConversation` (`src/lib/inbox.functions.ts`), sem novos endpoints.

---

## 5. Regressão obrigatória

Ver `INBOX-UX-01-A5-regression-report.md`.

**Resumo:** 0 regressões detectadas em Inbox / Runtime.

---

## 6. Decisão

✅ **Encerrada.** Item A5 pronto para piloto.
Aguardando autorização explícita para próximo item do Grupo A.
