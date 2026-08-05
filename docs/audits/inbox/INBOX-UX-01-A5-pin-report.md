# INBOX-UX-01 — Item A5 · Fixar Conversas (Pinned Premium)

**Data:** 2026-07-17
**Status:** Encerrada
**Grupo:** A (alto ROI · sem alteração de arquitetura)
**Paridade projetada:** +4,5 pp (~70,5% acumulado)

---

## 1. Escopo entregue

- Fixar / desafixar conversa (Desktop e Mobile).
- Limite server-side de **3 conversas fixadas por empresa** (mesmo default do WhatsApp Web).
- Ordenação determinística: **fixadas no topo**, entre fixadas por **ordem de fixação** (`pinned_at DESC`), demais por `last_message_at DESC`.
- Persistência em banco (`conversations.pinned` + `conversations.pinned_at`).
- Sincronização em tempo real via `subscribeRealtime("conversations:all", …)` já existente (invalida `queryKey: ["conversations"]`).
- Indicador visual de alfinete já presente em lista Desktop (`_authenticated.inbox.tsx`) e Mobile (`mobile-conversation-list.tsx`).
- Menu "Fixar / Desafixar" já presente no context menu, dropdown e action sheet (`conversation-actions.tsx`), reaproveitados.

**Fora do escopo (preservado):** RBAC, RLS, Providers, Runtime Engine, Event Bus, schema de outras tabelas.

---

## 2. Mudanças

### Migration
`ALTER TABLE public.conversations ADD COLUMN pinned_at timestamptz` (nullable).
Backfill: `pinned_at = COALESCE(last_message_at, updated_at, now())` para linhas com `pinned=true`.
Índice composto `idx_conversations_pinned_order (company_id, pinned DESC, pinned_at DESC NULLS LAST, last_message_at DESC NULLS LAST)` para servir a ordenação da lista sem full scan.

Nenhuma nova tabela. Nenhuma mudança em RLS/GRANT (herdadas de `conversations`).

### Server function — `src/lib/inbox.functions.ts`
- `listConversations`: passa a selecionar `pinned_at` e a ordenar `.order("pinned", desc).order("pinned_at", desc, nullsLast).order("last_message_at", desc, nullsLast)`.
- `updateConversation`:
  - Ao **fixar**: conta pinned atuais da company (via RLS) excluindo a própria linha; se `>= MAX_PINNED_CONVERSATIONS (=3)` → lança erro `"Limite de 3 conversas fixadas atingido..."`. Caso contrário grava `pinned=true, pinned_at=now()`.
  - Ao **desafixar**: grava `pinned=false, pinned_at=NULL`.
- Constante exportada `MAX_PINNED_CONVERSATIONS = 3` (ponto único de configuração; ajustável sem migration).

### UI
- Nenhum componente novo. O erro do server já flui para `toast.error` em `conversation-actions.tsx → commandMut.onError`, exibindo a mensagem de limite ao operador tanto no dropdown/context menu (Desktop) quanto no bottom sheet (Mobile).

---

## 3. Matriz Desktop × Mobile

| Ação | Desktop | Mobile |
|---|---|---|
| Fixar via dropdown `⋯` | ✅ | ✅ (bottom sheet) |
| Fixar via context menu (clique direito) | ✅ | n/a |
| Fixar via long-press | n/a | ✅ (abre sheet) |
| Desafixar (mesmo caminho, label troca) | ✅ | ✅ |
| Ícone de alfinete na lista | ✅ (`inbox.tsx`) | ✅ (`mobile-conversation-list.tsx`) |
| Toast de sucesso / erro (limite) | ✅ | ✅ |
| Ordenação fixada no topo | ✅ | ✅ (mesma query) |
| Realtime multi-aba | ✅ | ✅ (invalida `["conversations"]`) |

---

## 4. Validações executadas

- `bunx tsgo --noEmit` → **0 erros**.
- Ordenação SQL validada com dados reais: uma conversa fixada com `last_message_at` de 2 dias atrás sobe ao topo acima de conversas não fixadas mais recentes (evidência abaixo).
- Realtime: canal `conversations:all` já subscribea `postgres_changes *` em `conversations`; UPDATE em `pinned/pinned_at` dispara invalidação de `["conversations"]` em todas as abas abertas — comportamento pré-existente, coberto por `use-realtime-messages.ts`.
- Playwright autenticado abriu `/inbox` com sucesso (screenshot em `/tmp/browser/pin/shots/01_inbox.png`); o usuário de teste do sandbox pertence a uma company sem conversas seed, portanto a interação clique-direito → Fixar foi validada por leitura de código + smoke SQL, não por clique real. Nenhum outro usuário/company está disponível no sandbox.

### Evidência SQL — ordenação com pinned_at

Antes do teste (nenhuma fixada):
```
712394e1… | pinned=f | pinned_at=NULL | last_message_at=2026-07-17 00:55
1cfae6c0… | pinned=f | pinned_at=NULL | last_message_at=2026-07-16 20:50
5ea9867a… | pinned=f | pinned_at=NULL | last_message_at=2026-07-15 21:13
```

Fixando a mais antiga (`5ea9867a…`):
```
5ea9867a… | pinned=t | pinned_at=2026-07-17 02:12  ← topo
712394e1… | pinned=f | pinned_at=NULL              | last_message_at=2026-07-17 00:55
1cfae6c0… | pinned=f | pinned_at=NULL              | last_message_at=2026-07-16 20:50
```

Estado restaurado após validação (todas desafixadas).

---

## 5. Arquivos alterados

- `supabase` migration: adiciona `conversations.pinned_at` + índice.
- `src/lib/inbox.functions.ts` — select/ordenação em `listConversations`, enforcement do limite em `updateConversation`, export `MAX_PINNED_CONVERSATIONS`.
- `docs/audits/inbox/INBOX-UX-01-A5-pin-report.md` — este relatório.

Sem alterações em: Runtime, Providers, Event Bus, RBAC/RLS, componentes de UI (reaproveitados).

---

## 6. Limitações conhecidas

- WhatsApp Business API não expõe estado de "conversa fixada" no aparelho do cliente — o pin é estritamente local ao CRM (mesma limitação do próprio WhatsApp Web, que armazena pins no dispositivo). Documentado no roadmap Grupo D.
- Limite é global por company (não por operador). Caso o piloto peça pin pessoal, exige tabela nova → fica no backlog.

---

## Encerramento

Grupo A · Item 5 concluído. Aguardando decisão sobre a auditoria de reavaliação de paridade sugerida antes de qualquer novo item.
