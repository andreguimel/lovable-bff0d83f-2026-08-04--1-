# Bug 1 — Revalidação Funcional do Menu da Mensagem (Inbox)

**Data:** 2026-07-16
**Escopo:** Auditoria de código do menu de contexto/dropdown de mensagens no Inbox desktop, comparando com a expectativa (paridade WhatsApp Web).
**Referência de código:** `src/components/inbox/message-actions.tsx` (fonte única de verdade — desktop). Mobile: `src/components/inbox/mobile/mobile-message-actions-sheet.tsx`.

> Auditoria feita por leitura direta do código-fonte, não por Playwright. O Playwright confirma apenas que o dropdown/context-menu **abre**; a verdade funcional está nos `MenuItem`s efetivamente renderizados.

---

## Matriz Funcional (Desktop — `message-actions.tsx`)

| Ação                        | Existe | Abre | Executa | Persiste | Realtime | Status                                        |
| --------------------------- | ------ | ---- | ------- | -------- | -------- | --------------------------------------------- |
| Responder                   | ❌     | —    | —       | —        | —        | **Não existe** no menu                        |
| Reagir                      | ❌     | —    | —       | —        | —        | **Não existe** no menu                        |
| Encaminhar                  | ❌     | —    | —       | —        | —        | **Não existe** no menu                        |
| Copiar                      | ❌     | —    | —       | —        | —        | **Não existe** no menu                        |
| Selecionar mensagens        | ✅     | ✅   | ✅      | n/a      | n/a      | OK — entra em multi-select                    |
| Excluir para mim            | ✅     | ✅   | ✅      | ✅       | ✅       | OK — respeita capability do provider          |
| Excluir para todos          | ✅¹    | ✅   | ✅      | ✅       | ✅       | OK — habilitado só se outbound + capability   |
| Remover apenas do inbox     | ✅     | ✅   | ✅      | ✅       | ✅       | OK (extra, não tem no WhatsApp Web)           |
| Informações da mensagem     | ❌     | —    | —       | —        | —        | **Não existe** no menu                        |

¹ Renderizado sempre; `disabled` quando a mensagem é inbound ou o provider não suporta revoke.

### Cobertura por tipo/direção do bubble

Todos os bubbles renderizam via `<MessageActions>` (mesmo wrapper), portanto o menu **abre** em:

- ✅ mensagens enviadas (outbound)
- ✅ mensagens recebidas (inbound)
- ✅ texto
- ✅ imagem
- ✅ áudio
- ✅ documento

O que muda por tipo é apenas a ação **Copiar** (que deveria existir apenas para texto e não existe hoje). "Abrir" o menu funciona em todos.

---

## Conclusão da Revalidação

**Bug 1 NÃO pode ser encerrado como o usuário definiu.** O menu abre e funciona para as ações implementadas, mas **5 das 8 ações esperadas não existem** no código:

- Responder — ausente
- Reagir — ausente
- Encaminhar — ausente
- Copiar — ausente
- Informações da mensagem — ausente

Estas 5 ações não são "bugs de UX" nem regressão: nunca foram implementadas. Implementá-las é feature nova (novas Server Functions, novos states de composer, wiring por provider para reactions/reply-quote, tela de "Informações" com status por destinatário).

### O que está encerrado (parte funcional real)

- ✅ Menu **abre** por clique nos 3 pontos e por right-click.
- ✅ Menu **abre** em todos os tipos (texto/imagem/áudio/documento) e direções (in/out).
- ✅ Ações implementadas (Selecionar, Excluir p/ mim, Excluir p/ todos, Remover do inbox) executam, persistem e propagam via realtime.
- ✅ Nenhum bug funcional novo encontrado no escopo auditado.

### O que fica pendente

Movido para o backlog **INBOX-UX-01** (sem expandir escopo):

- INBOX-UX-01.a — Responder (quote/reply) — depende de provider
- INBOX-UX-01.b — Reagir (emoji reactions) — depende de provider
- INBOX-UX-01.c — Encaminhar (single + multi) — depende de provider
- INBOX-UX-01.d — Copiar texto — client-side, sem dependência de provider
- INBOX-UX-01.e — Informações da mensagem (status por destinatário) — depende de provider

---

## Arquivos consultados

- `src/components/inbox/message-actions.tsx` — menu desktop (fonte única).
- `src/components/inbox/mobile/mobile-message-actions-sheet.tsx` — equivalente mobile (mesma matriz de ações).
- `src/lib/message-delete.functions.ts` — capabilities de exclusão por provider.

## Alterações de código

Nenhuma. Auditoria estática, sem tocar em Runtime, Providers, RLS, RBAC, Event Bus ou Design System.
