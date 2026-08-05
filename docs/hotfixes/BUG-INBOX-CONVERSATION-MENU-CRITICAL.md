# BUG CRÍTICO — Inbox Menu da Conversa

**Data:** 2026-07-16  
**Status:** **Bloqueada para paridade total / hotfix funcional parcial aplicado**  
**Escopo preservado:** sem alteração em arquitetura, Runtime, Providers, Banco, RBAC, RLS, Event Bus ou Design System global.

## Causa raiz

| Item auditado | Resultado |
|---|---|
| Componente que renderizava o botão | **Não existia** na lista de conversas desktop (`src/routes/_authenticated.inbox.tsx`) nem mobile (`src/components/inbox/mobile/mobile-conversation-list.tsx`). |
| Componente que renderizava o menu | **Não existia** para a conversa na lista. Existia apenas menu de **mensagem** (`src/components/inbox/message-actions.tsx`) e menu simples no header mobile da conversa. |
| Estado de abertura | **Não existia** para conversa. Foi criado estado local `dropdownOpen`/`sheetOpen` em `ConversationActions`. |
| Evento de abertura | Antes: nenhum. Agora: clique esquerdo no botão, clique direito no item, teclado no trigger Radix, long press mobile. |
| Portal utilizado | Radix `DropdownMenuPrimitive.Portal`, Radix `ContextMenuPrimitive.Portal` e Radix `Sheet` via UI local. |
| z-index aplicado | Menus usam `z-50` nos primitives locais; trigger usa `z-10` dentro do item. |
| Context Provider necessário | `QueryClientProvider`, TanStack Start server function middleware autenticado, Radix primitives; nenhum provider custom ausente. |
| RBAC que influencia | Exclusão de mensagens usa `P.INBOX.DELETE`; ações de conversa existentes dependem de RLS da tabela `conversations`. Não há permissões granulares para pin/read/archive/mute. |
| Erro que impedia funcionamento | O menu esperado não estava implementado na lista; logo Playwright abrir um menu de **mensagem** não validava o bug de **conversa**. |

## Hotfix aplicado

- Criado `src/components/inbox/conversation-actions.tsx`.
- Integrado no desktop em `src/routes/_authenticated.inbox.tsx`.
- Integrado no mobile em `src/components/inbox/mobile/mobile-conversation-list.tsx`.
- Criada server function `markConversationAsUnread` em `src/lib/inbox.functions.ts` usando a coluna existente `conversations.unread_count`.
- Itens sem backend/provider persistente aparecem como indisponíveis, não executáveis, para evitar ação fake.

## Ações — matriz funcional

| Ação | Existe | Funciona | Persistência | Realtime | Provider |
|---|---:|---:|---:|---:|---|
| Responder | ❌ | ❌ | — | — | Depende de quote/reply por provider; composer normal existe, mas não via menu de conversa. |
| Reagir | ❌ | ❌ | — | — | Requer suporte provider + storage de reactions. |
| Favoritar | ❌ | ❌ | — | — | Não há campo/tabela de favoritos para conversa/mensagem. |
| Fixar conversa | ✅ | ✅ | ✅ `conversations.pinned` | ✅ `useRealtimeConversations` | Independente de provider. |
| Encaminhar | ❌ | ❌ | — | — | Requer seletor de destino e reenvio por provider. |
| Copiar | ✅ | ✅ | n/a | n/a | Client-side; copia telefone/texto disponível da conversa. |
| Editar | ❌ | ❌ | — | — | Requer provider com edição e schema de revisão. |
| Excluir para mim | ⚠️ | ⚠️ | ✅ apenas para mensagens | ✅ mensagens | Já existe em `MessageActions`; não existe para conversa inteira sem modelo de arquivamento/deleção por usuário. |
| Excluir para todos | ⚠️ | ⚠️ | ✅ apenas para mensagens outbound | ✅ mensagens | Respeita `DeleteCapabilities`; não existe para conversa inteira. |
| Selecionar mensagens | ⚠️ | ⚠️ | n/a | n/a | Existe dentro da conversa; não existe como ação da lista. |
| Informações | ❌ | ❌ | — | — | Não há tela de informações/status por conversa. |
| Silenciar conversa | ❌ | ❌ | — | — | Não há preferências de notificação por conversa. |
| Marcar como não lida | ✅ | ✅ | ✅ `conversations.unread_count=1` | ✅ `useRealtimeConversations` | Independente de provider. |
| Arquivar | ❌ | ❌ | — | — | Não há `archived_at`/estado persistente de arquivo em `conversations`; mapear para `resolved` seria ação fake. |

## Evidências antes/depois

- **Antes:** lista de conversas não possuía botão/menu de três pontos; somente `<Link>` do item.
- **Depois:** lista desktop/mobile renderiza `ConversationActions` com abertura por clique, right-click, teclado e long press mobile.
- **Vídeo desktop:** `/tmp/browser/inbox-conversation-menu/videos_final/5b61f85b30a37a17d61c30b38118e96e.webm`.
- **Vídeo right-click + ações:** `/tmp/browser/inbox-conversation-menu/videos_targeted/808422f5cd6fa4717533fa87c18f6d84.webm`.
- **Vídeo mobile long press:** `/tmp/browser/inbox-conversation-menu/videos_touchscreen/d2e2fbf43be272463f265ed4505a55e2.webm`.
- **Screenshots:**
  - Clique esquerdo abre: `/tmp/browser/inbox-conversation-menu/screenshots_final/03_left_click_open.png`.
  - Teclado abre: `/tmp/browser/inbox-conversation-menu/screenshots_final/02_keyboard_open.png`.
  - Clique direito abre: `/tmp/browser/inbox-conversation-menu/screenshots_targeted/01_right_click_open.png`.
  - Copiar executa: `/tmp/browser/inbox-conversation-menu/screenshots_final/05_copy_executed.png`.
  - Marcar lida/não lida executa: `/tmp/browser/inbox-conversation-menu/screenshots_targeted/02_read_toggle_after.png`.
  - Fixar/desafixar executa: `/tmp/browser/inbox-conversation-menu/screenshots_targeted/03_pin_toggle_after.png`.
  - Mobile long press abre sheet: `/tmp/browser/inbox-conversation-menu/screenshots/13_touchscreen_long_press_sheet.png`.

## Validação executada

- Playwright com sessão autenticada: `/inbox` carregou com 3 menus de conversa.
- Abertura por teclado: OK.
- Abertura por clique esquerdo: OK.
- Abertura por clique direito: OK.
- Abertura mobile long press em contexto touch: OK.
- Copiar: OK após fallback seguro quando Clipboard API é negada pelo browser embutido.
- Marcar como lida/não lida: OK; persiste em `conversations.unread_count` e invalida queries/realtime.
- Fixar/desafixar: OK; persiste em `conversations.pinned` e invalida queries/realtime.

## Decisão

**Bloqueada para paridade WhatsApp Web completa.**  
O hotfix corrige a causa raiz do menu inexistente/não acionável e entrega ações reais já suportadas. Ações sem persistência/provider/schema foram mantidas indisponíveis e devem permanecer no backlog INBOX-UX-01; implementá-las agora exigiria nova funcionalidade e/ou banco/provider.